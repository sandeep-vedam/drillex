import { PrismaClient } from '@prisma/client';
import { existsSync } from 'fs';
try { if (!process.env.DATABASE_URL && existsSync('.env')) (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile('.env'); } catch {}
import argon2 from 'argon2';

const prisma = new PrismaClient();
async function main() {
  const site = await prisma.site.upsert({ where: { name: 'Main Site' }, update: {}, create: { name: 'Main Site' } });
  const users = [
    { employeeId: 'ADM001', name: 'System Admin', role: 'ADMIN' },
    { employeeId: 'MGR001', name: 'Ops Manager', role: 'MANAGER' },
    { employeeId: 'SUP001', name: 'Shift Supervisor', role: 'SUPERVISOR' },
    { employeeId: 'TEC001', name: 'Fitter One', role: 'TECHNICIAN' },
    { employeeId: 'OPR001', name: 'Driller One', role: 'OPERATOR' },
  ] as const;
  const passwordHash = await argon2.hash('Password123');
  for (const u of users) {
    await prisma.user.upsert({ where: { employeeId: u.employeeId }, update: {}, create: { ...u, passwordHash, siteId: site.id } });
  }
  const operator = await prisma.user.findUniqueOrThrow({ where: { employeeId: 'OPR001' } });
  const asset = await prisma.asset.upsert({
    where: { assetNumber: 'DRL-001' }, update: {},
    create: { assetNumber: 'DRL-001', name: 'Drill Rig #1', category: 'DRILLING', make: 'Sandvik', model: 'DP1500i',
      serialNumber: 'SN-0001', yearOfManufacture: 2021, commissionedAt: new Date('2021-06-01'), siteId: site.id },
  });
  await prisma.assetOperator.upsert({ where: { assetId_userId: { assetId: asset.id, userId: operator.id } }, update: {}, create: { assetId: asset.id, userId: operator.id } });
  for (const c of [['Bentonite', 'KG'], ['Polymer', 'LITRES'], ['Foam', 'LITRES']] as const) {
    await prisma.chemical.upsert({ where: { name: c[0] }, update: {}, create: { name: c[0], defaultUnit: c[1] } });
  }
  for (const [partNo, name, qty, min, cost] of [['FLT-OIL-01', 'Engine oil filter', 12, 4, 18.5], ['FLT-HYD-02', 'Hydraulic return filter', 6, 2, 42], ['FLT-AIR-03', 'Air filter element', 3, 4, 35], ['OIL-15W40-20L', 'Engine oil 15W40 (20 L)', 10, 3, 95], ['GRS-EP2-18KG', 'EP2 grease (18 kg)', 4, 2, 70], ['BLT-ALT-07', 'Alternator belt', 2, 2, 28]] as const) {
    await prisma.part.upsert({ where: { partNo }, update: {}, create: { partNo, name, qtyOnHand: qty, minQty: min, unitCost: cost } });
  }
  console.log('Seeded. Logins: ADM001/MGR001/SUP001/TEC001/OPR001 with password Password123');
}
main().finally(() => prisma.$disconnect());
