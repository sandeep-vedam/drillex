import { PrismaClient } from '@prisma/client';
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
  console.log('Seeded. Logins: ADM001/MGR001/SUP001/TEC001/OPR001 with password Password123');
}
main().finally(() => prisma.$disconnect());
