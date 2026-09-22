import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Integration tests against a real Postgres (DATABASE_URL) — run `prisma migrate deploy && db:seed` first (CI does).
 * Covers the SRS rules that matter most: auth + RBAC at API level, daily-reading alerts, shift-report validations, approval workflow, sync idempotency.
 */
let app: INestApplication; let prisma: PrismaService;
const PW = 'Password123';
const tokenCache = new Map<string, string>(); // the login route is throttled (10/60s) — most tests just need *a* valid token, not a fresh login
async function loginRaw(employeeId: string, deviceId = 'e2e') { return request(app.getHttpServer()).post('/api/v1/auth/login').send({ employeeId, password: PW, deviceId }); }
async function login(employeeId: string, deviceId = 'e2e') {
  const key = `${employeeId}:${deviceId}`;
  if (deviceId === 'e2e' && tokenCache.has(key)) return tokenCache.get(key)!;
  const t = (await loginRaw(employeeId, deviceId)).body.accessToken as string;
  if (deviceId === 'e2e') tokenCache.set(key, t);
  return t;
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const today = new Date(); const day = (offset: number) => new Date(today.getTime() - offset * 864e5).toISOString().slice(0, 10);

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET ??= 'test-access'; process.env.JWT_REFRESH_SECRET ??= 'test-refresh';
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication(); app.setGlobalPrefix('api/v1'); await app.init();
  prisma = app.get(PrismaService);
  // isolate from any previous run: clear data this suite creates
  await prisma.dailyReading.deleteMany({ where: { notes: { startsWith: '[e2e]' } } });
  await prisma.shiftReport.deleteMany({ where: { holeRef: { startsWith: 'E2E' } } });
  await prisma.alert.deleteMany({ where: { message: { contains: 'e2e-never' } } });
});
afterAll(async () => { await app.close(); });

describe('auth & RBAC', () => {
  it('rejects bad credentials and logs the attempt', async () => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ employeeId: 'OPR001', password: 'wrong-pass-1', deviceId: 'e2e' });
    expect(r.status).toBe(401);
    expect(await prisma.loginEvent.count({ where: { employeeId: 'OPR001', success: false, deviceId: 'e2e' } })).toBeGreaterThan(0);
  });
  it('issues tokens for an operator and enforces permissions at the API', async () => {
    const t = await login('OPR001'); expect(t).toBeTruthy();
    expect((await request(app.getHttpServer()).get('/api/v1/users').set(auth(t))).status).toBe(403);
    expect((await request(app.getHttpServer()).get('/api/v1/assets').set(auth(t))).status).toBe(200);
  });
  it('2FA requirement is admin-configurable per role (SystemSetting), off by default', async () => {
    await prisma.systemSetting.deleteMany({ where: { key: 'roles_requiring_2fa' } });
    const off = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ employeeId: 'MGR001', password: PW, deviceId: 'e2e' });
    expect(off.status).toBeLessThan(300); // unconfigured -> no role requires 2FA
    expect(off.body.requires2faSetup).toBeUndefined();

    await prisma.systemSetting.upsert({ where: { key: 'roles_requiring_2fa' }, create: { key: 'roles_requiring_2fa', value: ['MANAGER'] }, update: { value: ['MANAGER'] } });
    const on = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ employeeId: 'MGR001', password: PW, deviceId: 'e2e' });
    expect([200, 201, 401]).toContain(on.status); // enrolled → 401 without code; not enrolled → requires2faSetup
    if (on.status < 400) expect(on.body.requires2faSetup).toBe(true);

    await prisma.systemSetting.deleteMany({ where: { key: 'roles_requiring_2fa' } });
  });
});

describe('daily readings (SRS §5)', () => {
  it('operator submits; flags raise alerts; duplicates rejected', async () => {
    const t = await login('OPR001');
    const asset = await prisma.asset.findFirstOrThrow({ where: { assetNumber: 'DRL-001' } });
    const date = day(400); // far in the past so it never collides with live data
    const base = { assetId: asset.id, date, hourMeter: 100, fuelStart: 50, fuelEnd: 30, engineOil: 'OK', hydraulicOil: 'OK', coolant: 'OK', airFilter: 'OK', battery: 'OK', preStartChecklistDone: true, warningLights: false, unusualNoises: false, leaks: true, leaksNote: 'e2e-never', conditionRating: 2, notes: '[e2e] test' };
    await prisma.dailyReading.deleteMany({ where: { assetId: asset.id, date: new Date(date) } });
    const r = await request(app.getHttpServer()).post('/api/v1/daily-readings').set(auth(t)).send(base);
    expect(r.status).toBe(201); expect(r.body.fuelConsumed).toBe('20'); expect(r.body.alerts).toEqual(['LEAKS', 'MAINTENANCE_REVIEW']);
    expect((await request(app.getHttpServer()).post('/api/v1/daily-readings').set(auth(t)).send(base)).status).toBe(409);
    expect((await request(app.getHttpServer()).post('/api/v1/daily-readings').set(auth(t)).send({ ...base, date: day(401), conditionRating: 9 })).status).toBe(400);
    await prisma.alert.deleteMany({ where: { source: `DAILY_READING:${r.body.id}` } });
  });
});

describe('shift reports (SRS §4) + approval', () => {
  it('validates depths, computes meters, supervisor approves, operator cannot', async () => {
    const op = await login('OPR001'); const sup = await login('SUP001');
    const asset = await prisma.asset.findFirstOrThrow({ where: { assetNumber: 'DRL-001' } }); const site = await prisma.site.findFirstOrThrow();
    const date = day(400);
    await prisma.shiftReport.deleteMany({ where: { assetId: asset.id, date: new Date(date) } });
    const body = { assetId: asset.id, siteId: site.id, date, shift: 'NIGHT', holeRef: 'E2E-1', startDepth: 10, endDepth: 25.5, holesCompleted: 2, holeDiameterMm: 102, rockType: 'Granite', penetrationRate: 12, chemicals: [] };
    expect((await request(app.getHttpServer()).post('/api/v1/shift-reports').set(auth(op)).send({ ...body, endDepth: 5 })).status).toBe(400);
    const r = await request(app.getHttpServer()).post('/api/v1/shift-reports').set(auth(op)).send(body);
    expect(r.status).toBe(201); expect(Number(r.body.totalMeters)).toBe(15.5); expect(r.body.status).toBe('SUBMITTED');
    expect((await request(app.getHttpServer()).post(`/api/v1/shift-reports/${r.body.id}/approve`).set(auth(op))).status).toBe(403);
    const a = await request(app.getHttpServer()).post(`/api/v1/shift-reports/${r.body.id}/approve`).set(auth(sup));
    expect(a.status).toBe(201); expect(a.body.status).toBe('APPROVED');
    expect((await request(app.getHttpServer()).post(`/api/v1/shift-reports/${r.body.id}/unlock`).set(auth(sup)).send({ reason: 'e2e' })).status).toBe(403); // supervisors cannot edit approved data
  });
});

describe('offline sync (SRS §9.2)', () => {
  it('replays are idempotent and same-day duplicates become conflicts', async () => {
    const t = await login('OPR001');
    const asset = await prisma.asset.findFirstOrThrow({ where: { assetNumber: 'DRL-001' } });
    const date = day(402); const id = crypto.randomUUID();
    await prisma.dailyReading.deleteMany({ where: { assetId: asset.id, date: new Date(date) } });
    const payload = { id, assetId: asset.id, date, hourMeter: 1, fuelStart: 2, fuelEnd: 1, engineOil: 'OK', hydraulicOil: 'OK', coolant: 'OK', airFilter: 'OK', battery: 'OK', preStartChecklistDone: true, warningLights: false, unusualNoises: false, leaks: false, conditionRating: 5, notes: '[e2e] sync' };
    const ops = { ops: [{ opId: 'a', kind: 'daily_reading', payload }] };
    expect((await request(app.getHttpServer()).post('/api/v1/sync/push').set(auth(t)).send(ops)).body.results[0].status).toBe('applied');
    expect((await request(app.getHttpServer()).post('/api/v1/sync/push').set(auth(t)).send(ops)).body.results[0].status).toBe('duplicate');
    const c = await request(app.getHttpServer()).post('/api/v1/sync/push').set(auth(t)).send({ ops: [{ opId: 'b', kind: 'daily_reading', payload: { ...payload, id: crypto.randomUUID() } }] });
    expect(c.body.results[0].status).toBe('conflict');
    await prisma.syncConflict.deleteMany({ where: { entity: 'DailyReading', versions: { path: ['incoming', 'notes'], equals: '[e2e] sync' } } });
  });

  it('an attachment queued before the record it belongs to is applied, not rejected', async () => {
    const t = await login('OPR001');
    const asset = await prisma.asset.findFirstOrThrow({ where: { assetNumber: 'DRL-001' } });
    const date = day(404); const id = crypto.randomUUID();
    await prisma.dailyReading.deleteMany({ where: { assetId: asset.id, date: new Date(date) } });
    const reading = { id, assetId: asset.id, date, hourMeter: 1, fuelStart: 2, fuelEnd: 1, engineOil: 'OK', hydraulicOil: 'OK', coolant: 'OK', airFilter: 'OK', battery: 'OK', preStartChecklistDone: true, warningLights: false, unusualNoises: false, leaks: false, conditionRating: 5, notes: '[e2e] ordering' };
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    // The device queues the photo first, which is the order the app submits in.
    const r = await request(app.getHttpServer()).post('/api/v1/sync/push').set(auth(t)).send({ ops: [
      { opId: 'att-first', kind: 'attachment', payload: { ownerType: 'DailyReading', ownerId: id, kind: 'PHOTO', contentType: 'image/png', base64: png } },
      { opId: 'reading', kind: 'daily_reading', payload: reading },
    ] });
    expect(r.status).toBe(201);
    const byId = Object.fromEntries(r.body.results.map((x: { opId: string; status: string }) => [x.opId, x.status]));
    expect(byId).toEqual({ 'att-first': 'applied', reading: 'applied' });
    expect(await prisma.attachment.count({ where: { ownerType: 'DailyReading', ownerId: id } })).toBe(1);

    await prisma.attachment.deleteMany({ where: { ownerType: 'DailyReading', ownerId: id } });
    await prisma.dailyReading.deleteMany({ where: { id } });
  });

  it('one malformed op envelope is rejected individually — it does not fail the whole batch', async () => {
    const t = await login('OPR001');
    const asset = await prisma.asset.findFirstOrThrow({ where: { assetNumber: 'DRL-001' } });
    const date = day(403);
    await prisma.dailyReading.deleteMany({ where: { assetId: asset.id, date: new Date(date) } });
    const good = { id: crypto.randomUUID(), assetId: asset.id, date, hourMeter: 1, fuelStart: 2, fuelEnd: 1, engineOil: 'OK', hydraulicOil: 'OK', coolant: 'OK', airFilter: 'OK', battery: 'OK', preStartChecklistDone: true, warningLights: false, unusualNoises: false, leaks: false, conditionRating: 5, notes: '[e2e] batch' };
    const r = await request(app.getHttpServer()).post('/api/v1/sync/push').set(auth(t)).send({ ops: [{ opId: 'bad-1', kind: 'not_a_real_kind' }, { opId: 'good-1', kind: 'daily_reading', payload: good }] });
    expect(r.status).toBe(201);
    expect(r.body.results.find((x: { opId: string }) => x.opId === 'bad-1').status).toBe('rejected');
    expect(r.body.results.find((x: { opId: string }) => x.opId === 'good-1').status).toBe('applied');
    await prisma.dailyReading.deleteMany({ where: { assetId: asset.id, date: new Date(date) } });
  });
});

describe('asset register management', () => {
  const site = () => prisma.site.findFirstOrThrow();
  const user = (employeeId: string) => prisma.user.findUniqueOrThrow({ where: { employeeId } });
  async function newAsset(token: string, operatorIds: string[]) {
    const s = await site();
    const r = await request(app.getHttpServer()).post('/api/v1/assets').set(auth(token))
      .send({ name: '[e2e] register target', category: 'ANCILLARY', make: 'Atlas', model: 'T1', serialNumber: `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, yearOfManufacture: 2020, commissionedAt: day(400), siteId: s.id, operatorIds });
    expect(r.status).toBe(201);
    return r.body.id as string;
  }
  async function scrub(id: string) {
    await prisma.jobCard.deleteMany({ where: { assetId: id } });
    await prisma.assetOperator.deleteMany({ where: { assetId: id } });
    await prisma.auditLog.deleteMany({ where: { entity: 'Asset', entityId: id } });
    await prisma.asset.delete({ where: { id } });
  }

  it('edits an asset, keeps the number/category immutable, and closes the old operator window instead of dropping it', async () => {
    const admin = await login('ADM001');
    const opr = await user('OPR001'); const tec = await user('TEC001');
    const id = await newAsset(admin, [opr.id]);
    const before = await prisma.asset.findUniqueOrThrow({ where: { id } });

    const edited = await request(app.getHttpServer()).patch(`/api/v1/assets/${id}`).set(auth(admin)).send({ name: '[e2e] renamed', make: 'Sandvik', operatorIds: [tec.id], category: 'DRILLING' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ name: '[e2e] renamed', make: 'Sandvik', assetNumber: before.assetNumber, category: 'ANCILLARY' }); // category is stripped, number never changes
    expect(edited.body.operators.map((o: { userId: string }) => o.userId)).toEqual([tec.id]); // only the open window is returned
    expect(await prisma.assetOperator.findUniqueOrThrow({ where: { assetId_userId: { assetId: id, userId: opr.id } } })).toMatchObject({ validTo: expect.any(Date) }); // history kept, not deleted

    const one = await request(app.getHttpServer()).get(`/api/v1/assets/${id}`).set(auth(admin)); // the detail page reads a single asset
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ id, name: '[e2e] renamed', assetNumber: before.assetNumber });
    expect((await request(app.getHttpServer()).get(`/api/v1/assets/${crypto.randomUUID()}`).set(auth(admin))).status).toBe(404);

    await scrub(id);
  });

  it('takes photos against an asset and serves them back, gated by asset:write', async () => {
    const admin = await login('ADM001'); const opr = await user('OPR001');
    const id = await newAsset(admin, [opr.id]);
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const body = { ownerType: 'Asset', ownerId: id, kind: 'PHOTO', contentType: 'image/png', base64: png };

    const up = await request(app.getHttpServer()).post('/api/v1/attachments').set(auth(admin)).send(body);
    expect(up.status).toBe(201);
    expect(up.body.url).toContain(id);

    const listed = await request(app.getHttpServer()).get(`/api/v1/attachments?ownerType=Asset&ownerId=${id}`).set(auth(admin));
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toMatchObject({ kind: 'PHOTO', mimeType: 'image/png' });

    const tec = await login('TEC001'); // TECHNICIAN has no asset:write, so it cannot attach to an asset
    expect((await request(app.getHttpServer()).post('/api/v1/attachments').set(auth(tec)).send(body)).status).toBe(403);
    expect((await request(app.getHttpServer()).post('/api/v1/attachments').set(auth(admin)).send({ ...body, contentType: 'image/gif' })).status).toBe(400);

    await prisma.attachment.deleteMany({ where: { ownerType: 'Asset', ownerId: id } });
    await scrub(id);
  });

  it('blocks status changes and delete while a job card is open — except decommissioning', async () => {
    const admin = await login('ADM001'); const techToken = await login('TEC001');
    const tec = await user('TEC001');
    const id = await newAsset(admin, [tec.id]);
    const patch = (body: object) => request(app.getHttpServer()).patch(`/api/v1/assets/${id}`).set(auth(admin)).send(body);

    const jc = await request(app.getHttpServer()).post('/api/v1/job-cards').set(auth(techToken))
      .send({ assetId: id, date: day(0), jobType: 'BREAKDOWN_REPAIR', workPerformed: '[e2e] holds the asset open', technicianIds: [tec.id] });
    expect(jc.status).toBe(201);
    expect(await prisma.asset.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'UNDER_MAINTENANCE' });

    expect((await patch({ status: 'ACTIVE' })).status).toBe(400);
    expect((await patch({ status: 'IDLE' })).status).toBe(400);
    expect((await patch({ status: 'UNDER_MAINTENANCE' })).status).toBe(400); // owned by the job-card flow, never set by hand
    expect((await request(app.getHttpServer()).delete(`/api/v1/assets/${id}`).set(auth(admin))).status).toBe(400);
    expect((await patch({ status: 'DECOMMISSIONED' })).status).toBe(200); // the one status the job-card flow leaves alone

    const closed = await request(app.getHttpServer()).patch(`/api/v1/job-cards/${jc.body.id}`).set(auth(techToken)).send({ status: 'COMPLETED' });
    expect(closed.status).toBe(200);
    const deleted = await request(app.getHttpServer()).delete(`/api/v1/assets/${id}`).set(auth(admin));
    expect(deleted.status).toBe(200);

    const listed = await request(app.getHttpServer()).get('/api/v1/assets').set(auth(admin));
    expect(listed.body.some((a: { id: string }) => a.id === id)).toBe(false); // gone from the register
    expect(await prisma.jobCard.count({ where: { assetId: id } })).toBe(1); // its history is not
    expect(await prisma.assetOperator.count({ where: { assetId: id, validTo: null } })).toBe(0);

    await scrub(id);
  });
});

describe('negative-scenario hardening', () => {
  it('rejects a parts stock movement that would take qtyOnHand below zero', async () => {
    const t = await login('TEC001'); // TECHNICIAN has parts:write; SUPERVISOR does not
    const part = await prisma.part.findUniqueOrThrow({ where: { partNo: 'FLT-OIL-01' } });
    const r = await request(app.getHttpServer()).post(`/api/v1/parts/${part.id}/movements`).set(auth(t)).send({ type: 'OUT', quantity: part.qtyOnHand + 1000 });
    expect(r.status).toBe(400);
    expect(await prisma.part.findUniqueOrThrow({ where: { id: part.id } })).toMatchObject({ qtyOnHand: part.qtyOnHand }); // untouched
  });

  it('rejects a job card whose parts usage exceeds stock on hand, without deducting anything', async () => {
    const t = await login('TEC001');
    const asset = await prisma.asset.findFirstOrThrow({ where: { assetNumber: 'DRL-001' } });
    const part = await prisma.part.findUniqueOrThrow({ where: { partNo: 'BLT-ALT-07' } }); // seeded qtyOnHand: 2
    const r = await request(app.getHttpServer()).post('/api/v1/job-cards').set(auth(t)).send({ assetId: asset.id, date: day(0), jobType: 'BREAKDOWN_REPAIR', workPerformed: '[e2e] insufficient stock test', parts: [{ partId: part.id, quantity: part.qtyOnHand + 50 }] });
    expect(r.status).toBe(400);
    expect(await prisma.part.findUniqueOrThrow({ where: { id: part.id } })).toMatchObject({ qtyOnHand: part.qtyOnHand });
  });

  it('rejects an invalid user status value instead of 500ing', async () => {
    const admin = await login('ADM001'); const target = await prisma.user.findUniqueOrThrow({ where: { employeeId: 'OPR001' } });
    const r = await request(app.getHttpServer()).patch(`/api/v1/users/${target.id}/status`).set(auth(admin)).send({ status: 'NOT_A_REAL_STATUS' });
    expect(r.status).toBe(400);
  });

  it('attachment access requires the same permission/scope as the owning record — not just any authenticated user', async () => {
    const reading = await prisma.dailyReading.findFirstOrThrow();
    const tec = await login('TEC001'); // TECHNICIAN has no daily_reading:read at all
    const denied = await request(app.getHttpServer()).get(`/api/v1/attachments?ownerType=DailyReading&ownerId=${reading.id}`).set(auth(tec));
    expect(denied.status).toBe(403);
    const sup = await login('SUP001'); // SUPERVISOR has site-scoped daily_reading:read
    const allowed = await request(app.getHttpServer()).get(`/api/v1/attachments?ownerType=DailyReading&ownerId=${reading.id}`).set(auth(sup));
    expect(allowed.status).toBe(200);
  });
});
