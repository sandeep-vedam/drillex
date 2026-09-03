import { PrismaClient } from '@prisma/client';
import { existsSync } from 'fs';
try { if (!process.env.DATABASE_URL && existsSync('.env')) (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile('.env'); } catch {}
/** Demo data: 30 days of readings + shift reports for the seeded fleet, so dashboards and reports look alive. `pnpm db:demo` */
const prisma = new PrismaClient();
const rnd = (a: number, b: number) => Math.round((a + Math.random() * (b - a)) * 10) / 10;
async function main() {
  const op = await prisma.user.findUniqueOrThrow({ where: { employeeId: 'OPR001' } });
  const assets = await prisma.asset.findMany({ where: { deletedAt: null }, include: { site: true } });
  const chems = await prisma.chemical.findMany();
  let readings = 0, shifts = 0;
  for (let back = 31; back >= 2; back--) {
    const date = new Date(); date.setUTCDate(date.getUTCDate() - back); date.setUTCHours(0, 0, 0, 0);
    for (const a of assets) {
      if (await prisma.dailyReading.findUnique({ where: { assetId_date: { assetId: a.id, date } } })) continue;
      const flag = Math.random() < 0.08;
      await prisma.dailyReading.create({ data: { assetId: a.id, userId: op.id, date, hourMeter: 4000 + (31 - back) * rnd(6, 10), fuelStart: 100, fuelEnd: rnd(30, 70), fuelConsumed: 0, engineOil: 'OK', hydraulicOil: Math.random() < 0.1 ? 'LOW' : 'OK', coolant: 'OK', airFilter: 'OK', battery: 'OK', warningLights: flag, leaks: false, unusualNoises: false, preStartChecklistDone: true, conditionRating: flag ? 2 : rnd(3, 5) | 0, tyrePressures: {}, notes: '[demo]' } });
      readings++;
      if (a.category === 'DRILLING' && Math.random() < 0.85) {
        const start = rnd(0, 50), end = start + rnd(90, 180);
        await prisma.shiftReport.create({ data: { assetId: a.id, userId: op.id, siteId: a.siteId, date, shift: 'DAY', holeRef: `BB-${10 + (31 - back)}`, startDepth: start, endDepth: end, totalMeters: Math.round((end - start) * 10) / 10, holesCompleted: 6 + ((Math.random() * 8) | 0), holeDiameterMm: 115, rockType: ['Granite', 'Basalt', 'Sandstone'][(Math.random() * 3) | 0], penetrationRate: rnd(12, 22), downtimeHours: Math.random() < 0.3 ? rnd(0.5, 3) : 0, downtimeReason: Math.random() < 0.3 ? 'Waiting on blast' : null, status: back > 3 ? 'APPROVED' : 'SUBMITTED', chemicals: { create: chems.slice(0, 2).map((c) => ({ chemicalId: c.id, quantity: rnd(10, 40), unit: c.defaultUnit })) } } });
        shifts++;
      }
    }
  }
  await prisma.dailyReading.updateMany({ where: { notes: '[demo]' }, data: {} });
  console.log(`Demo data: ${readings} readings, ${shifts} shift reports`);
}
main().finally(() => prisma.$disconnect());
