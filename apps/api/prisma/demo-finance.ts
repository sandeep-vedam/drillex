import { PrismaClient } from '@prisma/client';
import { existsSync } from 'fs';
try { if (!process.env.DATABASE_URL && existsSync('.env')) (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile('.env'); } catch {}
import argon2 from 'argon2';

/**
 * Demo data for the finance and plant hire modules: the fleet and the active deployments from the client spec
 * (§3, §6.4), dated relative to today so the credit countdown shows the same badges as the spec's table.
 * Idempotent — safe to run again. `pnpm db:demo-finance`
 */
const prisma = new PrismaClient();
const day = (offset: number) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset); return d; };

// machine, category, name, client, site, mode, days left on credit (null = cash), rate/day, currency
const FLEET = [
  ['DRL-001', 'DRILLING', 'Drill Rig #1', 'Konige Mining', 'Kasempa', 'CASH', null, 2800, 'USD'],
  ['DRL-003', 'DRILLING', 'Drill Rig #3', 'Barrick Lumwana', 'Open Pit', 'CREDIT', 2, 3200, 'USD'],
  ['DRL-005', 'DRILLING', 'Drill Rig #5', 'Oval Mining', 'Mumbwa', 'CREDIT', 18, 2600, 'USD'],
  ['DRL-007', 'DRILLING', 'Drill Rig #7', 'Kansanshi Mine', 'Pit 3', 'CREDIT', 5, 3400, 'USD'],
  ['DRL-009', 'DRILLING', 'Drill Rig #9', 'MMG Solwezi', 'North', 'CASH', null, 3000, 'USD'],
  ['EXC-001', 'EXCAVATOR', 'Excavator #1', null, null, null, null, null, null],
  ['EXC-002', 'EXCAVATOR', 'Excavator #2', 'Mopani Copper', 'Shaft 4', 'CREDIT', 7, 18500, 'ZMW'],
  ['GRD-001', 'GRADER', 'Grader #1', 'ZCCM-IH', 'Kabundi', 'CREDIT', 14, 15000, 'ZMW'],
  ['TRK-001', 'TRUCK', 'Tipper Truck #1', 'Midnight Sun', 'Valley', 'CASH', null, 9500, 'ZMW'],
] as const;

async function main() {
  const site = await prisma.site.findFirstOrThrow({ where: { name: 'Main Site' } });
  const fin = await prisma.user.findUniqueOrThrow({ where: { employeeId: 'FIN001' } });
  const passwordHash = await argon2.hash('Password123');
  // A plant operator for the excavator, so the plant machine form and requests can be tried.
  const plantOp = await prisma.user.upsert({ where: { employeeId: 'OPR002' }, update: {}, create: { employeeId: 'OPR002', name: 'Plant Operator Two', role: 'OPERATOR', passwordHash, siteId: site.id } });

  let deployments = 0;
  for (const [assetNumber, category, name, client, siteName, mode, daysLeft, rate, currency] of FLEET) {
    const asset = await prisma.asset.upsert({
      where: { assetNumber }, update: {},
      create: { assetNumber, name, category, make: 'Demo', model: 'Demo', serialNumber: `DEMO-${assetNumber}`, yearOfManufacture: 2022, commissionedAt: new Date('2022-01-01'), siteId: site.id },
    });
    if (assetNumber === 'EXC-002') await prisma.assetOperator.upsert({ where: { assetId_userId: { assetId: asset.id, userId: plantOp.id } }, update: { validTo: null }, create: { assetId: asset.id, userId: plantOp.id } });
    if (!client) continue;
    if (await prisma.deployment.findFirst({ where: { assetId: asset.id, deletedAt: null, status: { not: 'DEMOBILISED' } } })) continue;
    const c = (await prisma.client.findFirst({ where: { name: client } })) ?? (await prisma.client.create({ data: { name: client } }));
    const start = day(-40);
    const d = await prisma.deployment.create({ data: {
      assetId: asset.id, clientId: c.id, site: siteName!, startDate: start, expectedEndDate: day(60), ratePerDay: rate!, currency: currency!,
      paymentMode: mode!, creditTermDays: mode === 'CREDIT' ? 30 : null, status: 'ACTIVE', createdById: fin.id, reviewStatus: 'APPROVED', reviewedById: fin.id, reviewedAt: new Date(),
    } });
    deployments++;
    if (mode === 'CREDIT') {
      // A block paid 30 days ago covering up to `daysLeft` days from today.
      const paidFrom = day(-30); const daysCovered = 30 + daysLeft!;
      await prisma.payment.create({ data: { clientId: c.id, deploymentId: d.id, paymentDate: paidFrom, amount: rate! * daysCovered, currency: currency!, method: 'BANK_TRANSFER', reference: `TRF-${assetNumber}`, paidFrom, daysCovered, createdById: fin.id, reviewStatus: 'APPROVED', reviewedById: fin.id, reviewedAt: new Date() } });
    } else {
      await prisma.payment.create({ data: { clientId: c.id, deploymentId: d.id, paymentDate: day(-35), amount: rate! * 45, currency: currency!, method: 'CASH', createdById: fin.id, reviewStatus: 'APPROVED', reviewedById: fin.id, reviewedAt: new Date() } });
    }
    // Plant machines record utilisation as days worked; drilling rigs use their shift reports.
    if (category !== 'DRILLING') for (let back = 30; back >= 1; back--) {
      await prisma.daysWorked.upsert({ where: { deploymentId_workDate_shift: { deploymentId: d.id, workDate: day(-back), shift: 'FULL_DAY' } }, update: {},
        create: { deploymentId: d.id, workDate: day(-back), shift: 'FULL_DAY', hoursWorked: 9, operatorEmployeeId: 'OPR002', createdById: fin.id, reviewStatus: 'APPROVED', reviewedById: fin.id, reviewedAt: new Date() } });
    }
  }
  console.log(`Finance demo: ${FLEET.length} machines, ${deployments} new deployments. Plant operator login: OPR002 / Password123`);
}
main().finally(() => prisma.$disconnect());
