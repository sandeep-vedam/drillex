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
  const res = await loginRaw(employeeId, deviceId);
  // The login route is throttled (10/60s); past that the suite signs in through the service so later tests still get a token.
  const t = res.status === 429
    ? ((await app.get((await import('../src/auth/auth.service')).AuthService).login({ employeeId, password: PW, deviceId })) as { accessToken: string }).accessToken
    : (res.body.accessToken as string);

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
    // SRS §4.5: any holder of shift_report:unlock (supervisors by default) may return an approved report for correction.
    expect((await request(app.getHttpServer()).post(`/api/v1/shift-reports/${r.body.id}/unlock`).set(auth(op)).send({ reason: 'e2e' })).status).toBe(403);
    const u = await request(app.getHttpServer()).post(`/api/v1/shift-reports/${r.body.id}/unlock`).set(auth(sup)).send({ reason: 'e2e wrong depth' });
    expect(u.status).toBe(201); expect(u.body.status).toBe('UNLOCKED');
    expect(await prisma.auditLog.count({ where: { entity: 'ShiftReport', entityId: r.body.id, action: 'UNLOCK' } })).toBe(1);
    const fixed = await request(app.getHttpServer()).patch(`/api/v1/shift-reports/${r.body.id}`).set(auth(op)).send({ ...body, endDepth: 30 });
    expect(fixed.status).toBe(200); expect(fixed.body.status).toBe('SUBMITTED'); expect(Number(fixed.body.totalMeters)).toBe(20);
  });
});

describe('offline sync (SRS §9.2)', () => {
  it('replays are idempotent and same-day duplicates become conflicts', async () => {
    const t = await login('OPR001');
    const asset = await prisma.asset.findFirstOrThrow({ where: { assetNumber: 'DRL-001' } });
    const date = day(402); const id = crypto.randomUUID();
    await prisma.dailyReading.deleteMany({ where: { assetId: asset.id, date: new Date(date) } });
    const payload = { id, assetId: asset.id, date, hourMeter: 1, fuelStart: 2, fuelEnd: 1, engineOil: 'OK', hydraulicOil: 'OK', coolant: 'OK', airFilter: 'OK', battery: 'OK', preStartChecklistDone: true, warningLights: false, unusualNoises: false, leaks: false, conditionRating: 5, notes: '[e2e] sync' };
    const ops = { ops: [{ opId: crypto.randomUUID(), kind: 'daily_reading', payload }] };
    expect((await request(app.getHttpServer()).post('/api/v1/sync/push').set(auth(t)).send(ops)).body.results[0].status).toBe('applied');
    expect((await request(app.getHttpServer()).post('/api/v1/sync/push').set(auth(t)).send(ops)).body.results[0].status).toBe('duplicate');
    const c = await request(app.getHttpServer()).post('/api/v1/sync/push').set(auth(t)).send({ ops: [{ opId: crypto.randomUUID(), kind: 'daily_reading', payload: { ...payload, id: crypto.randomUUID() } }] });
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
      { opId: `att-first-${id}`, kind: 'attachment', payload: { ownerType: 'DailyReading', ownerId: id, kind: 'PHOTO', contentType: 'image/png', base64: png } },
      { opId: `reading-${id}`, kind: 'daily_reading', payload: reading },
    ] });
    expect(r.status).toBe(201);
    const byId = Object.fromEntries(r.body.results.map((x: { opId: string; status: string }) => [x.opId, x.status]));
    expect(byId).toEqual({ [`att-first-${id}`]: 'applied', [`reading-${id}`]: 'applied' });
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
    const bad = `bad-${good.id}`, ok = `good-${good.id}`;
    const r = await request(app.getHttpServer()).post('/api/v1/sync/push').set(auth(t)).send({ ops: [{ opId: bad, kind: 'not_a_real_kind' }, { opId: ok, kind: 'daily_reading', payload: good }] });
    expect(r.status).toBe(201);
    expect(r.body.results.find((x: { opId: string }) => x.opId === bad).status).toBe('rejected');
    expect(r.body.results.find((x: { opId: string }) => x.opId === ok).status).toBe('applied');
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
    const cards = await prisma.jobCard.findMany({ where: { assetId: id }, select: { id: true } });
    await prisma.attachment.deleteMany({ where: { ownerType: 'JobCard', ownerId: { in: cards.map((c) => c.id) } } });
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

    // SRS §7.6: no completion without the technician's signature…
    expect((await request(app.getHttpServer()).patch(`/api/v1/job-cards/${jc.body.id}`).set(auth(techToken)).send({ status: 'COMPLETED' })).status).toBe(400);
    const sigId = crypto.randomUUID();
    expect((await request(app.getHttpServer()).post('/api/v1/attachments').set(auth(techToken)).send({ id: sigId, ownerType: 'JobCard', ownerId: jc.body.id, kind: 'SIGNATURE', contentType: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' })).status).toBe(201);
    const closed = await request(app.getHttpServer()).patch(`/api/v1/job-cards/${jc.body.id}`).set(auth(techToken)).send({ status: 'COMPLETED', techSignatureAttachmentId: sigId });
    expect(closed.status).toBe(200);
    // …and, with approval required (the default), it still holds the machine until a supervisor signs it off.
    expect((await request(app.getHttpServer()).delete(`/api/v1/assets/${id}`).set(auth(admin))).status).toBe(400);
    expect((await request(app.getHttpServer()).post(`/api/v1/job-cards/${jc.body.id}/approve`).set(auth(await login('MGR001')))).status).toBe(201);
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

describe('dynamic RBAC (roles & permissions admin)', () => {
  it('create → grant → assign takes effect with no re-login; rename keeps the key; delete is guarded', async () => {
    const admin = await login('ADM001');
    // A run that failed half-way leaves its role behind; clear it so the generated key is predictable.
    const stale = await prisma.role.findMany({ where: { key: { startsWith: 'E2E_SITE_COORDINATOR' } } });
    await prisma.user.updateMany({ where: { role: { in: stale.map((r) => r.key) } }, data: { role: 'OPERATOR', status: 'DISABLED' } });
    await prisma.role.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });

    const created = await request(app.getHttpServer()).post('/api/v1/roles').set(auth(admin))
      .send({ name: '[e2e] Site Coordinator', permissions: [{ permission: 'daily_reading:read', scope: 'site' }] });
    expect(created.status).toBe(201);
    const roleId = created.body.id as string; const roleKey = created.body.key as string;
    expect(roleKey).toBe('E2E_SITE_COORDINATOR');

    const site = await prisma.site.findFirstOrThrow();
    const employeeId = `E2E${Date.now().toString().slice(-6)}`;
    const newUser = await request(app.getHttpServer()).post('/api/v1/users').set(auth(admin))
      .send({ employeeId, name: '[e2e] rbac test user', role: roleKey, siteId: site.id });
    expect(newUser.status).toBe(201);

    // New users get a generated temporary credential (client spec §10.2), returned once to the admin.
    const userToken = (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ employeeId, password: newUser.body.temporaryPassword, deviceId: 'e2e' })).body.accessToken as string;
    // the role grants daily_reading:read only
    expect((await request(app.getHttpServer()).get('/api/v1/daily-readings').set(auth(userToken))).status).toBe(200);
    expect((await request(app.getHttpServer()).get('/api/v1/assets').set(auth(userToken))).status).toBe(403);

    // grant asset:read too — no re-login, proves the matrix cache invalidates on write
    const updated = await request(app.getHttpServer()).patch(`/api/v1/roles/${roleId}`).set(auth(admin))
      .send({ permissions: [{ permission: 'daily_reading:read', scope: 'site' }, { permission: 'asset:read', scope: 'site' }] });
    expect(updated.status).toBe(200);
    expect((await request(app.getHttpServer()).get('/api/v1/assets').set(auth(userToken))).status).toBe(200);

    // renaming only changes the display name — the key business logic and the JWT rely on is untouched
    const renamed = await request(app.getHttpServer()).patch(`/api/v1/roles/${roleId}`).set(auth(admin)).send({ name: '[e2e] Renamed Coordinator' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.key).toBe(roleKey);

    // delete is blocked while a user still holds the role
    expect((await request(app.getHttpServer()).delete(`/api/v1/roles/${roleId}`).set(auth(admin))).status).toBe(409);

    const target = await prisma.user.findUniqueOrThrow({ where: { employeeId } });
    const reassigned = await request(app.getHttpServer()).patch(`/api/v1/users/${target.id}/role`).set(auth(admin)).send({ role: 'OPERATOR' });
    expect(reassigned.status).toBe(200); expect(reassigned.body.role).toBe('OPERATOR');
    expect((await request(app.getHttpServer()).delete(`/api/v1/roles/${roleId}`).set(auth(admin))).status).toBe(200);

    // a built-in role can never be deleted, regardless of assignment
    const opRole = await prisma.role.findUniqueOrThrow({ where: { key: 'OPERATOR' } });
    expect((await request(app.getHttpServer()).delete(`/api/v1/roles/${opRole.id}`).set(auth(admin))).status).toBe(403);

    await prisma.device.deleteMany({ where: { userId: target.id } }); // signing in registered a device
    await prisma.refreshToken.deleteMany({ where: { userId: target.id } });
    await prisma.user.delete({ where: { id: target.id } });
  });

  it('rejects unknown roles and unknown permissions with 400, not a raw DB error', async () => {
    const admin = await login('ADM001');
    const target = await prisma.user.findUniqueOrThrow({ where: { employeeId: 'OPR001' } });
    expect((await request(app.getHttpServer()).patch(`/api/v1/users/${target.id}/role`).set(auth(admin)).send({ role: 'NOT_A_REAL_ROLE' })).status).toBe(400);
    expect((await request(app.getHttpServer()).post('/api/v1/roles').set(auth(admin)).send({ name: '[e2e] bad grant', permissions: [{ permission: 'not:a_permission', scope: 'all' }] })).status).toBe(400);
  });
});

describe('SRS gap fixes (2026-09)', () => {
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const post = (path: string, t: string, body?: object) => request(app.getHttpServer()).post(`/api/v1${path}`).set(auth(t)).send(body ?? {});
  const patch = (path: string, t: string, body: object) => request(app.getHttpServer()).patch(`/api/v1${path}`).set(auth(t)).send(body);
  const get = (path: string, t: string) => request(app.getHttpServer()).get(`/api/v1${path}`).set(auth(t));
  const reading = (assetId: string, date: string, extra: object = {}) => ({ id: crypto.randomUUID(), assetId, date, hourMeter: 1200, fuelStart: 2, fuelEnd: 1, engineOil: 'OK', hydraulicOil: 'OK', coolant: 'OK', airFilter: 'OK', battery: 'OK', preStartChecklistDone: true, warningLights: false, unusualNoises: false, leaks: false, conditionRating: 5, notes: '[e2e] gap', ...extra });

  it('FR-6.1: a schedule given only an interval gets a due point, and an hour-based one anchors on the first hour reading', async () => {
    const mgr = await login('MGR001');
    const asset = await prisma.asset.findFirstOrThrow({ where: { assetNumber: 'DRL-001' } });
    const days = await post('/maintenance/schedules', mgr, { assetId: asset.id, serviceType: 'ANNUAL', description: '[e2e] annual', intervalDays: 365 });
    expect(days.status).toBe(201);
    expect(new Date(days.body.nextDueAt).getTime()).toBeGreaterThan(Date.now() + 360 * 864e5);

    // Current hours = the higher of the daily-reading meter and the shift-report end meter (rigs log hours on the shift report).
    const [readingMax, shiftMax] = await Promise.all([
      prisma.dailyReading.aggregate({ where: { assetId: asset.id }, _max: { hourMeter: true } }),
      prisma.shiftReport.aggregate({ where: { assetId: asset.id, deletedAt: null }, _max: { endHourMeter: true } }),
    ]);
    const meters = [readingMax._max.hourMeter, shiftMax._max.endHourMeter].filter((v) => v != null).map(Number);
    const latest = { _max: { hourMeter: meters.length ? Math.max(...meters) : null } };
    const hours = await post('/maintenance/schedules', mgr, { assetId: asset.id, serviceType: 'HR_250', description: '[e2e] 250h', intervalHours: 250 });
    expect(hours.status).toBe(201);
    if (latest._max.hourMeter != null) expect(Number(hours.body.nextDueHours)).toBe(Number(latest._max.hourMeter) + 250);

    // A machine with no readings yet: no due point until the first one, then the daily job fills it in.
    const bare = await prisma.asset.create({ data: { assetNumber: `E2E-${Date.now()}`, name: '[e2e] no readings', category: 'OTHER', make: 'x', model: 'y', serialNumber: 's', yearOfManufacture: 2020, commissionedAt: new Date(), siteId: asset.siteId } });
    const pending = await post('/maintenance/schedules', mgr, { assetId: bare.id, serviceType: 'HR_500', description: '[e2e] 500h', intervalHours: 500 });
    expect(pending.body.nextDueHours).toBeNull();
    await prisma.dailyReading.create({ data: { assetId: bare.id, userId: (await prisma.user.findUniqueOrThrow({ where: { employeeId: 'OPR001' } })).id, date: new Date(day(1)), hourMeter: 40, fuelStart: 1, fuelEnd: 0, fuelConsumed: 1, engineOil: 'OK', hydraulicOil: 'OK', coolant: 'OK', airFilter: 'OK', battery: 'OK', preStartChecklistDone: true, warningLights: false, unusualNoises: false, leaks: false, conditionRating: 5 } });
    await post('/maintenance/jobs/reminders', mgr);
    expect(Number((await prisma.maintenanceSchedule.findUniqueOrThrow({ where: { id: pending.body.id } })).nextDueHours)).toBe(540);

    await prisma.maintenanceSchedule.deleteMany({ where: { description: { startsWith: '[e2e]' } } });
    await prisma.dailyReading.deleteMany({ where: { assetId: bare.id } });
    await prisma.asset.delete({ where: { id: bare.id } });
  });

  it('FR-7.1 / FR-3.2: numbers stay unique under concurrent creates and keep counting past 999', async () => {
    const tec = await login('TEC001');
    const asset = await prisma.asset.findFirstOrThrow({ where: { assetNumber: 'DRL-001' } });
    const res = await Promise.all(Array.from({ length: 6 }, () => post('/job-cards', tec, { assetId: asset.id, date: day(0), jobType: 'INSPECTION', workPerformed: '[e2e] concurrent numbering' })));
    expect(res.map((r) => r.status)).toEqual(Array(6).fill(201));
    expect(new Set(res.map((r) => r.body.jobNo)).size).toBe(6);
    await prisma.jobCard.deleteMany({ where: { workPerformed: '[e2e] concurrent numbering' } });
    await prisma.asset.update({ where: { id: asset.id }, data: { status: 'ACTIVE' } });

    const admin = await login('ADM001'); const site = await prisma.site.findFirstOrThrow(); const opr = await prisma.user.findUniqueOrThrow({ where: { employeeId: 'OPR001' } });
    const leftovers = await prisma.asset.findMany({ where: { name: { in: ['[e2e] 999', '[e2e] past 999'] } }, select: { id: true } }); // from an interrupted run
    await prisma.assetOperator.deleteMany({ where: { assetId: { in: leftovers.map((x) => x.id) } } });
    await prisma.asset.deleteMany({ where: { id: { in: leftovers.map((x) => x.id) } } });
    const filler = await prisma.asset.create({ data: { assetNumber: 'EQP-999', name: '[e2e] 999', category: 'OTHER', make: 'x', model: 'y', serialNumber: 's', yearOfManufacture: 2020, commissionedAt: new Date(), siteId: site.id } });
    const mk = () => post('/assets', admin, { name: '[e2e] past 999', category: 'OTHER', make: 'x', model: 'y', serialNumber: `E2E-${Math.random()}`, yearOfManufacture: 2020, commissionedAt: day(10), siteId: site.id, operatorIds: [opr.id] });
    const a = await mk(); const b = await mk();
    expect([a.status, b.status]).toEqual([201, 201]);
    expect([a.body.assetNumber, b.body.assetNumber]).toEqual(['EQP-1000', 'EQP-1001']);
    await prisma.auditLog.deleteMany({ where: { entity: 'Asset', entityId: { in: [a.body.id, b.body.id] } } });
    await prisma.assetOperator.deleteMany({ where: { assetId: { in: [a.body.id, b.body.id] } } });
    await prisma.asset.deleteMany({ where: { id: { in: [filler.id, a.body.id, b.body.id] } } });
  });

  it('FR-7.6 / FR-7.2: a card cannot be created completed without a signature; technicians can be listed for the picker', async () => {
    const tec = await login('TEC001');
    const asset = await prisma.asset.findFirstOrThrow({ where: { assetNumber: 'DRL-001' } });
    const r = await post('/job-cards', tec, { assetId: asset.id, date: day(0), jobType: 'INSPECTION', workPerformed: '[e2e] no signature', status: 'COMPLETED' });
    expect(r.status).toBe(400);
    const techs = await get('/job-cards/technicians', tec);
    expect(techs.status).toBe(200);
    expect(techs.body.some((t: { employeeId: string }) => t.employeeId === 'TEC001')).toBe(true);
    expect((await get('/job-cards/technicians', await login('OPR001'))).status).toBe(403);
  });

  it('FR-7.5: purchase requests only move forward, and receiving books stock in exactly once', async () => {
    const tec = await login('TEC001');
    const part = await prisma.part.findUniqueOrThrow({ where: { partNo: 'FLT-OIL-01' } });
    const pr = await post('/parts/purchase-requests', tec, { partId: part.id, quantity: 3 });
    expect(pr.status).toBe(201);
    expect((await patch(`/parts/purchase-requests/${pr.body.id}`, tec, { status: 'RECEIVED' })).status).toBe(409); // must be ordered first
    expect((await patch(`/parts/purchase-requests/${pr.body.id}`, tec, { status: 'ORDERED' })).status).toBe(200);
    const twice = await Promise.all([patch(`/parts/purchase-requests/${pr.body.id}`, tec, { status: 'RECEIVED' }), patch(`/parts/purchase-requests/${pr.body.id}`, tec, { status: 'RECEIVED' })]);
    expect(twice.map((x) => x.status).sort()).toEqual([200, 409]);
    expect((await prisma.part.findUniqueOrThrow({ where: { id: part.id } })).qtyOnHand).toBe(part.qtyOnHand + 3);
    expect((await patch(`/parts/purchase-requests/${pr.body.id}`, tec, { status: 'CANCELLED' })).status).toBe(409); // received is final
    expect(await prisma.auditLog.count({ where: { entity: 'PurchaseRequest', entityId: pr.body.id } })).toBe(3); // create, ordered, received

    await prisma.part.update({ where: { id: part.id }, data: { qtyOnHand: part.qtyOnHand } });
    await prisma.purchaseRequest.delete({ where: { id: pr.body.id } });
  });

  it('FR-9.2.2: an op replayed with the same op ID is a duplicate even when the record carries no id of its own', async () => {
    const tec = await login('TEC001');
    const asset = await prisma.asset.findFirstOrThrow({ where: { assetNumber: 'DRL-001' } });
    const op = { opId: crypto.randomUUID(), kind: 'job_card', payload: { assetId: asset.id, date: day(0), jobType: 'INSPECTION', workPerformed: '[e2e] replayed op' } };
    const first = await post('/sync/push', tec, { ops: [op] });
    const again = await post('/sync/push', tec, { ops: [op] });
    expect(first.body.results[0].status).toBe('applied');
    expect(again.body.results[0]).toMatchObject({ status: 'duplicate', id: first.body.results[0].id });
    expect(await prisma.jobCard.count({ where: { workPerformed: '[e2e] replayed op' } })).toBe(1);
    await prisma.jobCard.deleteMany({ where: { workPerformed: '[e2e] replayed op' } });
    await prisma.asset.update({ where: { id: asset.id }, data: { status: 'ACTIVE' } });
  });

  it('FR-5.3: the alert threshold is configurable by an admin and applied to new readings', async () => {
    const admin = await login('ADM001'); const op = await login('OPR001');
    expect((await get('/settings/operations', op)).body).toMatchObject({ readingAlertThreshold: 2 });
    expect((await patch('/settings/operations', op, { readingAlertThreshold: 3 })).status).toBe(403);
    expect((await patch('/settings/operations', admin, { readingAlertThreshold: 9 })).status).toBe(400);
    expect((await patch('/settings/operations', admin, { readingAlertThreshold: 3 })).body).toMatchObject({ readingAlertThreshold: 3, jobCardApprovalRequired: true });
    const asset = await prisma.asset.findFirstOrThrow({ where: { assetNumber: 'DRL-001' } });
    const date = day(405); await prisma.dailyReading.deleteMany({ where: { assetId: asset.id, date: new Date(date) } });
    const r = await post('/daily-readings', op, reading(asset.id, date, { conditionRating: 3 }));
    expect(r.status).toBe(201);
    expect(r.body.alerts).toContain('MAINTENANCE_REVIEW');
    await prisma.systemSetting.deleteMany({ where: { key: 'operations' } });
    await prisma.alert.deleteMany({ where: { source: `DAILY_READING:${r.body.id}` } });
    await prisma.dailyReading.delete({ where: { id: r.body.id } });
  });

  it('FR-7.6: switching the approval rule off releases machines held only by completed-unapproved cards, and back on holds them again', async () => {
    const admin = await login('ADM001'); const tec = await login('TEC001');
    const asset = await prisma.asset.findFirstOrThrow({ where: { assetNumber: 'DRL-001' } });
    const jc = await post('/job-cards', tec, { assetId: asset.id, date: day(0), jobType: 'INSPECTION', workPerformed: '[e2e] policy toggle' });
    const sig = crypto.randomUUID();
    await post('/attachments', tec, { id: sig, ownerType: 'JobCard', ownerId: jc.body.id, kind: 'SIGNATURE', contentType: 'image/png', base64: PNG });
    expect((await patch(`/job-cards/${jc.body.id}`, tec, { status: 'COMPLETED', techSignatureAttachmentId: sig })).status).toBe(200);
    const status = async () => (await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).status;
    expect(await status()).toBe('UNDER_MAINTENANCE');
    await patch('/settings/operations', admin, { jobCardApprovalRequired: false });
    expect(await status()).toBe('ACTIVE');
    await patch('/settings/operations', admin, { jobCardApprovalRequired: true });
    expect(await status()).toBe('UNDER_MAINTENANCE');

    await prisma.systemSetting.deleteMany({ where: { key: 'operations' } });
    await prisma.attachment.deleteMany({ where: { ownerId: jc.body.id } });
    await prisma.jobCard.delete({ where: { id: jc.body.id } });
    await prisma.asset.update({ where: { id: asset.id }, data: { status: 'ACTIVE' } });
  });

  it('chemical master list can be managed by stores, not by operators', async () => {
    const tec = await login('TEC001'); const op = await login('OPR001');
    const name = `[e2e] Foam ${Date.now()}`;
    expect((await post('/chemicals', op, { name, defaultUnit: 'LITRES' })).status).toBe(403);
    const c = await post('/chemicals', tec, { name, defaultUnit: 'LITRES', unitCost: 4.5 });
    expect(c.status).toBe(201);
    expect((await post('/chemicals', tec, { name: name.toUpperCase(), defaultUnit: 'KG' })).status).toBe(409);
    expect((await patch(`/chemicals/${c.body.id}`, tec, { defaultUnit: 'KG' })).body.defaultUnit).toBe('KG');
    expect((await get('/chemicals', op)).body.some((x: { id: string }) => x.id === c.body.id)).toBe(true);
    await prisma.chemical.delete({ where: { id: c.body.id } });
  });

  it('FR-9.3.1: creating a user and uploading a file are audited', async () => {
    const admin = await login('ADM001');
    const emp = `E2E${Date.now().toString().slice(-6)}`;
    const u = await post('/users', admin, { employeeId: emp, name: 'Audit Target', role: 'OPERATOR', password: 'Password123' });
    expect(u.status).toBe(201);
    expect(await prisma.auditLog.count({ where: { entity: 'User', entityId: u.body.id, action: 'CREATE' } })).toBe(1);
    const asset = await prisma.asset.findFirstOrThrow({ where: { assetNumber: 'DRL-001' } });
    const att = await post('/attachments', admin, { ownerType: 'Asset', ownerId: asset.id, kind: 'PHOTO', contentType: 'image/png', base64: PNG });
    expect(att.status).toBe(201);
    expect(await prisma.auditLog.count({ where: { entity: 'Attachment', entityId: att.body.id, action: 'CREATE' } })).toBe(1);
    await prisma.attachment.delete({ where: { id: att.body.id } });
    await prisma.user.delete({ where: { id: u.body.id } });
  });

  it('FR-8.3: reports past 24 months are purged with their files; the last day of a range is included', async () => {
    const { ReportsService } = await import('../src/reports/reports.service');
    const { ReportBuildersService } = await import('../src/reports/report-builders.service');
    const { StorageService } = await import('../src/storage/storage.service');
    const storage = app.get(StorageService); const reports = app.get(ReportsService);
    const key = `reports/e2e-old-${Date.now()}.pdf`;
    await storage.putBase64(key, PNG, 'application/pdf');
    const old = await prisma.report.create({ data: { type: 'ASSET_HEALTH', periodStart: new Date('2020-01-01'), periodEnd: new Date('2020-01-31'), pdfKey: key, generatedBy: 'e2e', generatedAt: new Date(Date.now() - 25 * 30 * 864e5) } });
    const recent = await prisma.report.create({ data: { type: 'ASSET_HEALTH', periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-01-31'), generatedBy: 'e2e', generatedAt: new Date(Date.now() - 23 * 30 * 864e5) } });
    await reports.purgeOld();
    expect(await prisma.report.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.report.findUnique({ where: { id: recent.id } })).not.toBeNull();
    const { existsSync } = await import('fs'); const { join } = await import('path');
    if (storage.driver === 'local') expect(existsSync(join(process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'), key))).toBe(false);
    await prisma.report.delete({ where: { id: recent.id } });

    const today = new Date(`${day(0)}T00:00:00Z`);
    await prisma.auditLog.create({ data: { entity: 'MaintenanceSchedule', entityId: 'e2e-range', action: 'COMPLETE' } });
    const doc = await app.get(ReportBuildersService).build('MAINTENANCE_SUMMARY', today, today);
    expect(Number(doc.kpis.find((k) => k.label === 'Services completed')?.value)).toBeGreaterThanOrEqual(1);
    await prisma.auditLog.deleteMany({ where: { entityId: 'e2e-range' } });
  });
});

describe('operator forms (client spec §4A, §4B, §9.1–9.3)', () => {
  const D = (n: number) => day(600 + n);
  async function fixtures() {
    const site = await prisma.site.findFirstOrThrow({ where: { name: 'Main Site' } });
    const [op, sup, tec] = await Promise.all(['OPR001', 'SUP001', 'TEC001'].map((e) => prisma.user.findUniqueOrThrow({ where: { employeeId: e } })));
    const mk = async (assetNumber: string, category: 'DRILLING' | 'EXCAVATOR', operatorId: string) => {
      const a = await prisma.asset.upsert({ where: { assetNumber }, update: { deletedAt: null }, create: { assetNumber, name: `[e2e] ${assetNumber}`, category, make: 'E2E', model: 'E2E', serialNumber: assetNumber, yearOfManufacture: 2022, commissionedAt: new Date('2022-01-01'), siteId: site.id } });
      await prisma.assetOperator.upsert({ where: { assetId_userId: { assetId: a.id, userId: operatorId } }, update: { validTo: null }, create: { assetId: a.id, userId: operatorId } });
      await prisma.dailyReading.deleteMany({ where: { assetId: a.id } });
      await prisma.shiftReport.deleteMany({ where: { assetId: a.id } });
      return a;
    };
    const rig = await mk('DRL-E2E', 'DRILLING', op.id);
    const exc = await mk('EXC-E2E', 'EXCAVATOR', op.id);
    const other = await mk('DRL-E2E-OTHER', 'DRILLING', tec.id); // OPR001 is not assigned here
    return { site, op, sup, rig, exc, other };
  }
  const shiftBody = (assetId: string, siteId: string, date: string, extra: object = {}) => ({
    assetId, siteId, date, shift: 'DAY', holeRef: 'E2E-F', startDepth: 100, endDepth: 115.5, holesCompleted: 1, holeDiameterMm: 96, rockType: 'Granite',
    startHourMeter: 1520.2, endHourMeter: 1528.7, bitNumber: 'BT-042', bitSize: 'HQ', remarks: 'e2e remarks', chemicals: [], ...extra,
  });
  const base = { warningLights: false, unusualNoises: false, leaks: false, conditionRating: 4, faults: '[e2e] forms' };

  it('computes engine hours and penetration, keeps free-text chemicals, and reports the meter', async () => {
    const { site, rig } = await fixtures(); const t = await login('OPR001');
    const r = await request(app.getHttpServer()).post('/api/v1/shift-reports').set(auth(t)).send(shiftBody(rig.id, site.id, D(1), {
      penetrationRate: 999, // a typed value is ignored once the meters are given
      chemicals: [{ name: 'CAP 21', quantity: 2, unit: 'DRUMS' }, { name: 'bentonite', quantity: 25, unit: 'KG' }],
    }));
    expect(r.status).toBe(201);
    expect(Number(r.body.engineHours)).toBe(8.5);
    expect(Number(r.body.penetrationRate)).toBe(1.82); // 15.5 m / 8.5 h
    expect(r.body.bitSize).toBe('HQ'); expect(r.body.remarks).toBe('e2e remarks');
    const cap = r.body.chemicals.find((c: { name: string }) => c.name === 'CAP 21');
    const ben = r.body.chemicals.find((c: { name: string }) => c.name === 'bentonite');
    expect(cap.chemicalId).toBeNull(); expect(cap.unit).toBe('DRUMS');
    expect(ben.chemicalId).toBeTruthy(); // matched to the "Bentonite" master entry regardless of case
    const m = await request(app.getHttpServer()).get(`/api/v1/shift-reports/meter?assetId=${rig.id}`).set(auth(t));
    expect(m.body).toEqual({ lastEndMeter: 1528.7, cumulativeHours: 8.5 });
    // Both meters or neither, and end >= start
    expect((await request(app.getHttpServer()).post('/api/v1/shift-reports').set(auth(t)).send(shiftBody(rig.id, site.id, D(2), { endHourMeter: 1500 }))).status).toBe(400);
  });

  it('lets a supervisor enter for an assigned operator with a reason, and nobody else', async () => {
    const { site, op, sup, rig } = await fixtures(); const st = await login('SUP001'); const ot = await login('OPR001');
    const body = shiftBody(rig.id, site.id, D(3), { operatorId: op.id });
    expect((await request(app.getHttpServer()).post('/api/v1/shift-reports').set(auth(st)).send(body)).status).toBe(400); // reason is mandatory
    // A supervisor cannot file in their own name: they hold submission:on_behalf, not shift_report:create
    expect((await request(app.getHttpServer()).post('/api/v1/shift-reports').set(auth(st)).send(shiftBody(rig.id, site.id, D(3)))).status).toBe(403);
    // An operator cannot enter for someone else
    expect((await request(app.getHttpServer()).post('/api/v1/shift-reports').set(auth(ot)).send({ ...body, operatorId: sup.id, supervisorReason: 'not allowed' })).status).toBe(403);
    const r = await request(app.getHttpServer()).post('/api/v1/shift-reports').set(auth(st)).send({ ...body, supervisorReason: 'Operator off sick' });
    expect(r.status).toBe(201);
    expect(r.body.userId).toBe(op.id); expect(r.body.enteredById).toBe(sup.id); expect(r.body.supervisorReason).toBe('Operator off sick');
    expect(r.body.enteredBy.employeeId).toBe('SUP001');
    expect(await prisma.notification.count({ where: { userId: op.id, type: 'entered_on_behalf', title: { contains: 'DRL-E2E' } } })).toBeGreaterThan(0);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity: 'ShiftReport', entityId: r.body.id, action: 'SUBMIT' } });
    expect(audit.actorId).toBe(sup.id); expect(audit.diff).toMatchObject({ onBehalfOf: 'OPR001' });
  });

  it('records a rig condition check and alerts on a critical answer', async () => {
    const { rig } = await fixtures(); const t = await login('OPR001');
    const body = { ...base, assetId: rig.id, date: D(4), formType: 'RIG', engineOil: 'OK', hydraulicOil: 'OK', coolant: 'LOW', gearOil: 'OK', flushPump: 'CRITICAL', rodCondition: 'GOOD', bitCondition: 'WORN' };
    expect((await request(app.getHttpServer()).post('/api/v1/daily-readings').set(auth(t)).send({ ...body, rodCondition: 'WORN' })).status).toBe(400);
    const r = await request(app.getHttpServer()).post('/api/v1/daily-readings').set(auth(t)).send(body);
    expect(r.status).toBe(201);
    expect(r.body.formType).toBe('RIG'); expect(r.body.hourMeter).toBeNull(); expect(r.body.alerts).toEqual(['CRITICAL_CHECK']);
    expect(await prisma.alert.count({ where: { source: `DAILY_READING:${r.body.id}`, message: 'Critical check: Water / flush pump' } })).toBe(1);
    const flagged = await request(app.getHttpServer()).get(`/api/v1/daily-readings?flagged=1&assetId=${rig.id}`).set(auth(t));
    expect(flagged.body.map((x: { id: string }) => x.id)).toContain(r.body.id);
  });

  it('records plant machine readings with usage and keeps maintenance hours current', async () => {
    const { exc } = await fixtures(); const t = await login('OPR001');
    const body = { ...base, assetId: exc.id, date: D(5), formType: 'PLANT', startReading: 2400, endReading: 2408.5, coolant: 'OK', engineOil: 'OK', gearOil: 'OK', hydraulicOil: 'OK', brakeFluid: 'NA', fuelLevel: 'LOW', trackCondition: 'GOOD', tyreCondition: 'NA', attachmentCondition: 'FAIR', lights: 'OK', brakes: 'OK', fuelAdded: 120 };
    expect((await request(app.getHttpServer()).post('/api/v1/daily-readings').set(auth(t)).send({ ...body, endReading: 2300 })).status).toBe(400);
    const r = await request(app.getHttpServer()).post('/api/v1/daily-readings').set(auth(t)).send(body);
    expect(r.status).toBe(201);
    expect(Number(r.body.usage)).toBe(8.5); expect(Number(r.body.hourMeter)).toBe(2408.5); expect(Number(r.body.fuelAdded)).toBe(120);
    expect(r.body.alerts).toEqual([]); // Low / Fair are highlighted on review but do not alert
    // Hour-based servicing reads the plant end reading, and a rig's shift-report end meter (its daily check has no meter)
    const { MaintenanceService } = await import('../src/maintenance/maintenance.service');
    const { site, rig } = await fixtures();
    await request(app.getHttpServer()).post('/api/v1/daily-readings').set(auth(t)).send(body);
    await request(app.getHttpServer()).post('/api/v1/shift-reports').set(auth(t)).send(shiftBody(rig.id, site.id, D(7)));
    const hours = await app.get(MaintenanceService).currentHours([exc.id, rig.id]);
    expect(hours.get(exc.id)).toBe(2408.5); expect(hours.get(rig.id)).toBe(1528.7);
  });

  it('enforces machine assignment on the offline sync path too', async () => {
    const { site, other } = await fixtures(); const t = await login('OPR001');
    const res = await request(app.getHttpServer()).post('/api/v1/sync/push').set(auth(t)).send({ ops: [{ opId: crypto.randomUUID(), kind: 'shift_report', payload: { id: crypto.randomUUID(), ...shiftBody(other.id, site.id, D(6)) } }] });
    expect(res.body.results[0].status).toBe('rejected');
    expect(res.body.results[0].error).toMatch(/not an assigned operator/);
  });
});

describe('accounts & credentials (client spec §10)', () => {
  it('issues a temporary PIN to a field role, enforces a 4-digit PIN, blocks immediately and locks after 5 failures', async () => {
    const { AuthService } = await import('../src/auth/auth.service');
    const authSvc = app.get(AuthService);
    const adm = await login('ADM001');
    const stale = await prisma.user.findUnique({ where: { employeeId: 'OPR9E2E' } });
    if (stale) {
      await prisma.refreshToken.deleteMany({ where: { userId: stale.id } }); await prisma.loginEvent.deleteMany({ where: { userId: stale.id } });
      await prisma.device.deleteMany({ where: { userId: stale.id } }); await prisma.notification.deleteMany({ where: { userId: stale.id } });
      await prisma.user.delete({ where: { id: stale.id } });
    }

    const created = await request(app.getHttpServer()).post('/api/v1/users').set(auth(adm)).send({ employeeId: 'OPR9E2E', name: '[e2e] PIN user', role: 'OPERATOR', phone: '+260 970 000 000' });
    expect(created.status).toBe(201);
    expect(created.body.usesPin).toBe(true);
    expect(created.body.temporaryPassword).toMatch(/^\d{6}$/);
    const id = created.body.id as string;

    const first = await authSvc.login({ employeeId: 'OPR9E2E', password: created.body.temporaryPassword, deviceId: 'e2e' });
    expect('user' in first && first.user.mustChangePassword).toBe(true);
    const t = (first as { accessToken: string }).accessToken;
    expect((await request(app.getHttpServer()).post('/api/v1/auth/change-password').set(auth(t)).send({ currentPassword: created.body.temporaryPassword, newPassword: 'Password123' })).status).toBe(400);
    expect((await request(app.getHttpServer()).post('/api/v1/auth/change-password').set(auth(t)).send({ currentPassword: created.body.temporaryPassword, newPassword: '4826' })).status).toBe(201);

    // Block: the existing access token stops working on the next request, and the refresh token is dead.
    const session = await authSvc.login({ employeeId: 'OPR9E2E', password: '4826', deviceId: 'e2e' }) as { accessToken: string; refreshToken: string };
    expect((await request(app.getHttpServer()).patch(`/api/v1/users/${id}/status`).set(auth(adm)).send({ status: 'BLOCKED' })).status).toBe(400); // reason required
    expect((await request(app.getHttpServer()).patch(`/api/v1/users/${id}/status`).set(auth(adm)).send({ status: 'BLOCKED', reason: 'Resigned' })).status).toBe(200);
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set(auth(session.accessToken));
    expect(me.status).toBe(401); expect(me.body.message).toBe('Account suspended. Contact your administrator.');
    await expect(authSvc.refresh(session.refreshToken)).rejects.toThrow();
    await expect(authSvc.login({ employeeId: 'OPR9E2E', password: '4826', deviceId: 'e2e' })).rejects.toThrow('Account suspended');
    expect(await prisma.auditLog.count({ where: { entity: 'User', entityId: id, action: 'BLOCKED' } })).toBe(1);

    // Unblock, then five wrong PINs in a row suspend the account until an admin unlocks it.
    await request(app.getHttpServer()).patch(`/api/v1/users/${id}/status`).set(auth(adm)).send({ status: 'ACTIVE' });
    for (let i = 0; i < 5; i++) await expect(authSvc.login({ employeeId: 'OPR9E2E', password: '0000', deviceId: 'e2e' })).rejects.toThrow();
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).status).toBe('SUSPENDED');
    await expect(authSvc.login({ employeeId: 'OPR9E2E', password: '4826', deviceId: 'e2e' })).rejects.toThrow('Account suspended');
    await request(app.getHttpServer()).patch(`/api/v1/users/${id}/status`).set(auth(adm)).send({ status: 'ACTIVE' });
    await expect(authSvc.login({ employeeId: 'OPR9E2E', password: '4826', deviceId: 'e2e' })).resolves.toHaveProperty('accessToken');
    expect(await prisma.auditLog.count({ where: { entity: 'User', entityId: id, action: { in: ['LOCKED_OUT', 'UNLOCKED'] } } })).toBe(2);
  });

  it('expires a temporary credential after 24 hours and exports users as CSV', async () => {
    const { AuthService } = await import('../src/auth/auth.service');
    const adm = await login('ADM001');
    const u = await prisma.user.findUniqueOrThrow({ where: { employeeId: 'OPR9E2E' } });
    const r = await request(app.getHttpServer()).post(`/api/v1/users/${u.id}/reset-password`).set(auth(adm));
    await prisma.user.update({ where: { id: u.id }, data: { tempCredentialExpiresAt: new Date(Date.now() - 1000) } });
    await expect(app.get(AuthService).login({ employeeId: 'OPR9E2E', password: r.body.temporaryPassword, deviceId: 'e2e' })).rejects.toThrow(/expired/);
    const csv = await request(app.getHttpServer()).get('/api/v1/users/export.csv').set(auth(adm));
    expect(csv.status).toBe(200); expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\n')[0]).toContain('Employee ID'); expect(csv.text).toContain('OPR9E2E');
    expect((await request(app.getHttpServer()).get('/api/v1/users/next-id?role=PLANT_HIRE_SUPERVISOR').set(auth(adm))).body.employeeId).toMatch(/^PSV\d{3}$/);
  });
});

describe('finance & plant hire (client spec §6, §11)', () => {
  async function setup() {
    const site = await prisma.site.findFirstOrThrow({ where: { name: 'Main Site' } });
    const mk = async (assetNumber: string, category: 'DRILLING' | 'EXCAVATOR') => {
      const a = await prisma.asset.upsert({ where: { assetNumber }, update: { deletedAt: null, status: 'ACTIVE' }, create: { assetNumber, name: `[e2e] ${assetNumber}`, category, make: 'E2E', model: 'E2E', serialNumber: assetNumber, yearOfManufacture: 2022, commissionedAt: new Date('2022-01-01'), siteId: site.id } });
      const deps = await prisma.deployment.findMany({ where: { assetId: a.id }, select: { id: true } });
      await prisma.payment.deleteMany({ where: { deploymentId: { in: deps.map((d) => d.id) } } });
      await prisma.daysWorked.deleteMany({ where: { deploymentId: { in: deps.map((d) => d.id) } } });
      await prisma.deployment.deleteMany({ where: { assetId: a.id } });
      return a;
    };
    return { plant: await mk('EXC-F2E', 'EXCAVATOR'), rig: await mk('DRL-F2E', 'DRILLING') };
  }
  const dep = (assetId: string, extra: object = {}) => ({ assetId, clientName: '[e2e] Client', site: 'Pit 9', startDate: day(20), ratePerDay: 1000, currency: 'ZMW', paymentMode: 'CREDIT', creditTermDays: 30, status: 'ACTIVE', ...extra });

  it('PSV entries wait for review, are limited to plant machines, and may be corrected once', async () => {
    const { plant, rig } = await setup(); const psv = await login('PSV001'); const fin = await login('FIN001');
    expect((await request(app.getHttpServer()).post('/api/v1/finance/deployments').set(auth(psv)).send(dep(rig.id))).status).toBe(403);
    const d = await request(app.getHttpServer()).post('/api/v1/finance/deployments').set(auth(psv)).send(dep(plant.id));
    expect(d.status).toBe(201); expect(d.body.reviewStatus).toBe('PENDING_REVIEW');
    expect(await prisma.notification.count({ where: { type: 'finance_review', user: { employeeId: 'FIN001' }, payload: { path: ['deploymentId'], equals: d.body.id } } })).toBe(1);
    expect((await request(app.getHttpServer()).patch(`/api/v1/finance/deployments/${d.body.id}`).set(auth(psv)).send(dep(plant.id, { ratePerDay: 1200 }))).status).toBe(403); // pending → locked
    // A second active deployment of the same machine is refused
    expect((await request(app.getHttpServer()).post('/api/v1/finance/deployments').set(auth(fin)).send(dep(plant.id))).status).toBe(409);
    expect((await request(app.getHttpServer()).post(`/api/v1/finance/deployments/${d.body.id}/review`).set(auth(fin)).send({ decision: 'REJECT' })).status).toBe(400); // reason required
    expect((await request(app.getHttpServer()).post(`/api/v1/finance/deployments/${d.body.id}/review`).set(auth(fin)).send({ decision: 'REJECT', reason: 'Wrong rate' })).status).toBe(201);
    const fixed = await request(app.getHttpServer()).patch(`/api/v1/finance/deployments/${d.body.id}`).set(auth(psv)).send(dep(plant.id, { ratePerDay: 1200 }));
    expect(fixed.status).toBe(200); expect(fixed.body.reviewStatus).toBe('PENDING_REVIEW'); expect(fixed.body.resubmitted).toBe(true);
    await request(app.getHttpServer()).post(`/api/v1/finance/deployments/${d.body.id}/review`).set(auth(fin)).send({ decision: 'REJECT', reason: 'Still wrong' });
    expect((await request(app.getHttpServer()).patch(`/api/v1/finance/deployments/${d.body.id}`).set(auth(psv)).send(dep(plant.id))).status).toBe(403); // only once
    expect(await prisma.auditLog.count({ where: { entity: 'Deployment', entityId: d.body.id, action: 'REJECT' } })).toBe(2);
  });

  it('computes days worked, billing, credit expiry and badges; PSV cannot change a saved payment', async () => {
    const { plant } = await setup(); const psv = await login('PSV001'); const fin = await login('FIN001');
    const d = (await request(app.getHttpServer()).post('/api/v1/finance/deployments').set(auth(fin)).send(dep(plant.id))).body;
    expect(d.reviewStatus).toBe('APPROVED');
    for (const [n, shift] of [[3, 'DAY'], [3, 'NIGHT'], [2, 'FULL_DAY']] as const) {
      expect((await request(app.getHttpServer()).post('/api/v1/finance/days-worked').set(auth(fin)).send({ deploymentId: d.id, workDate: day(n), shift, hoursWorked: 8, operatorEmployeeId: 'OPR002' })).status).toBe(201);
    }
    expect((await request(app.getHttpServer()).post('/api/v1/finance/days-worked').set(auth(fin)).send({ deploymentId: d.id, workDate: day(3), shift: 'DAY', hoursWorked: 8, operatorEmployeeId: 'OPR002' })).status).toBe(409);
    expect((await request(app.getHttpServer()).post('/api/v1/finance/days-worked').set(auth(fin)).send({ deploymentId: d.id, workDate: day(-1), shift: 'DAY', hoursWorked: 8, operatorEmployeeId: 'OPR002' })).status).toBe(400); // future
    const clientId = d.clientId as string;
    // Paid 10 days ago for 12 days → 2 days left → CRITICAL
    const pay = await request(app.getHttpServer()).post('/api/v1/finance/payments').set(auth(fin)).send({ clientId, deploymentId: d.id, paymentDate: day(10), amount: 500, currency: 'ZMW', method: 'BANK_TRANSFER', reference: 'E2E-1', paidFrom: day(10), daysCovered: 12 });
    expect(pay.status).toBe(201);
    expect((await request(app.getHttpServer()).post('/api/v1/finance/payments').set(auth(fin)).send({ clientId, paymentDate: day(1), amount: 5, currency: 'ZMW', method: 'CHEQUE' })).status).toBe(400); // cheque number required
    expect((await request(app.getHttpServer()).post('/api/v1/finance/payments').set(auth(fin)).send({ clientId, paymentDate: day(1), amount: 5, currency: 'GBP', method: 'CASH' })).status).toBe(400); // currency not in use
    const got = await request(app.getHttpServer()).get(`/api/v1/finance/deployments/${d.id}`).set(auth(fin));
    expect(got.body.daysWorked).toBe(2); // Day + Night on one date count once
    expect(got.body.billed).toBe(2000); expect(got.body.received).toBe(500); expect(got.body.outstanding).toBe(1500);
    expect(got.body.daysRemaining).toBe(2); expect(got.body.badge).toBe('CRITICAL');
    const alerts = await request(app.getHttpServer()).get('/api/v1/finance/alerts').set(auth(fin));
    const mine = alerts.body.find((a: { deploymentId: string }) => a.deploymentId === d.id);
    expect(mine.badge).toBe('CRITICAL'); expect(mine.message).toContain('EXC-F2E'); expect(mine.message).toContain('+260 975 236 381');
    // PSV payment: pending, not counted until approved, never editable by the PSV
    const p2 = await request(app.getHttpServer()).post('/api/v1/finance/payments').set(auth(psv)).send({ clientId, deploymentId: d.id, paymentDate: day(1), amount: 1500, currency: 'ZMW', method: 'CASH' });
    expect(p2.body.reviewStatus).toBe('PENDING_REVIEW');
    expect((await request(app.getHttpServer()).patch(`/api/v1/finance/payments/${p2.body.id}`).set(auth(psv)).send({ clientId, paymentDate: day(1), amount: 1, currency: 'ZMW', method: 'CASH' })).status).toBe(403);
    expect((await request(app.getHttpServer()).get(`/api/v1/finance/deployments/${d.id}`).set(auth(fin))).body.outstanding).toBe(1500);
    await request(app.getHttpServer()).post(`/api/v1/finance/payments/${p2.body.id}/review`).set(auth(fin)).send({ decision: 'APPROVE' });
    expect((await request(app.getHttpServer()).get(`/api/v1/finance/deployments/${d.id}`).set(auth(fin))).body.outstanding).toBe(0);
    // Summary and monthly report agree with the screen figures
    const summary = await request(app.getHttpServer()).get(`/api/v1/finance/summary?clientId=${clientId}`).set(auth(psv));
    expect(summary.body[0].daysWorked).toBe(2); expect(summary.body[0].outstanding.ZMW).toBe(0);
    const { ReportBuildersService } = await import('../src/reports/report-builders.service');
    const doc = await app.get(ReportBuildersService).build('MONTHLY_FINANCIAL', new Date(day(40)), new Date(day(0)));
    expect(doc.sections[0].rows.some((r) => r[0] === 'EXC-F2E')).toBe(true);
    // An operator cannot see finance; the Client Tracker gives them dates only
    const op = await login('OPR001');
    expect((await request(app.getHttpServer()).get('/api/v1/finance/dashboard').set(auth(op))).status).toBe(403);
  });
});

describe('requests (client spec §4A tab 7)', () => {
  it('routes to the office, fills the machine, and shows replies and status to the requester', async () => {
    const op = await login('OPR001'); const mgr = await login('MGR001'); const psv = await login('PSV001');
    const rig = await prisma.asset.findFirstOrThrow({ where: { assetNumber: 'DRL-001' } });
    const r = await request(app.getHttpServer()).post('/api/v1/requests').set(auth(op)).send({ type: 'SAFETY', priority: 'URGENT', details: '[e2e] Replace cracked hard hat', assetId: rig.id });
    expect(r.status).toBe(201); expect(r.body.status).toBe('RECEIVED'); expect(r.body.asset.assetNumber).toBe('DRL-001');
    const auto = await request(app.getHttpServer()).post('/api/v1/requests').set(auth(op)).send({ type: 'OTHER', priority: 'LOW', details: '[e2e] no machine given' });
    expect(auto.body.asset).not.toBeNull(); // filled from the operator's assignment

    expect(await prisma.notification.count({ where: { type: 'request_new', user: { employeeId: 'MGR001' }, payload: { path: ['requestId'], equals: r.body.id } } })).toBe(1);
    // The operator cannot change status; the manager can, and the operator sees the reply
    expect((await request(app.getHttpServer()).post(`/api/v1/requests/${r.body.id}/replies`).set(auth(op)).send({ status: 'RESOLVED' })).status).toBe(403);
    const rep = await request(app.getHttpServer()).post(`/api/v1/requests/${r.body.id}/replies`).set(auth(mgr)).send({ body: 'Ordered, arriving Friday', status: 'IN_PROGRESS' });
    expect(rep.status).toBe(201); expect(rep.body.status).toBe('IN_PROGRESS');
    const seen = await request(app.getHttpServer()).get(`/api/v1/requests/${r.body.id}`).set(auth(op));
    expect(seen.body.replies[0].body).toBe('Ordered, arriving Friday');
    // The plant hire supervisor only sees plant operators' requests — this one is on a drilling rig
    expect((await request(app.getHttpServer()).get(`/api/v1/requests/${r.body.id}`).set(auth(psv))).status).toBe(404);
    // Offline sync path
    const id = crypto.randomUUID();
    const s = await request(app.getHttpServer()).post('/api/v1/sync/push').set(auth(op)).send({ ops: [{ opId: crypto.randomUUID(), kind: 'request', payload: { id, type: 'OTHER', priority: 'LOW', details: '[e2e] via sync' } }] });
    expect(s.body.results[0].status).toBe('applied');
    const again = await request(app.getHttpServer()).post('/api/v1/sync/push').set(auth(op)).send({ ops: [{ opId: crypto.randomUUID(), kind: 'request', payload: { id, type: 'OTHER', priority: 'LOW', details: '[e2e] via sync' } }] });
    expect(again.body.results[0].status).toBe('duplicate');
  });
});
