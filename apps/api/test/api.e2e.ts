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
async function login(employeeId: string, deviceId = 'e2e') { const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ employeeId, password: PW, deviceId }); return r.body.accessToken as string; }
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
  it('requires 2FA for managers', async () => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ employeeId: 'MGR001', password: PW, deviceId: 'e2e' });
    expect([200, 201, 401]).toContain(r.status); // enrolled → 401 without code; not enrolled → requires2faSetup
    if (r.status < 400) expect(r.body.requires2faSetup).toBe(true);
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
    const asset = await prisma.asset.findFirstOrThrow({ where: { assetNumber: 'DRL-002' } });
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
});
