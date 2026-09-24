import { Body, ConflictException, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ShiftReportInput, ShiftReportSchema } from '@drillex/shared';
import { ShiftReportsService } from './shift-reports.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

const UnlockSchema = z.object({ reason: z.string().min(3) });
const ChemicalSchema = z.object({ name: z.string().trim().min(2), defaultUnit: z.enum(['LITRES', 'KG', 'BAGS']), unitCost: z.number().nonnegative().nullable().optional(), monthlyBudget: z.number().nonnegative().nullable().optional() });
type ChemicalInput = z.infer<typeof ChemicalSchema>;

@Controller()
export class ShiftReportsController {
  constructor(private svc: ShiftReportsService, private prisma: PrismaService) {}
  @Get('chemicals') chemicals() { return this.prisma.chemical.findMany({ orderBy: { name: 'asc' } }); }
  /** Chemical master list (SRS §4.3), kept by whoever keeps the stores — the same grant as parts. */
  @Post('chemicals') @RequirePermission('parts:write')
  async createChemical(@CurrentUser() u: AuthUser, @Body(new ZodPipe(ChemicalSchema)) b: ChemicalInput) {
    if (await this.prisma.chemical.findFirst({ where: { name: { equals: b.name, mode: 'insensitive' } } })) throw new ConflictException(`${b.name} is already on the list`);
    const c = await this.prisma.chemical.create({ data: b });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'Chemical', entityId: c.id, action: 'CREATE', diff: b } });
    return c;
  }
  @Patch('chemicals/:id') @RequirePermission('parts:write')
  async updateChemical(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(ChemicalSchema.partial())) b: Partial<ChemicalInput>) {
    if (b.name && (await this.prisma.chemical.findFirst({ where: { id: { not: id }, name: { equals: b.name, mode: 'insensitive' } } }))) throw new ConflictException(`${b.name} is already on the list`);
    const c = await this.prisma.chemical.update({ where: { id }, data: b });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'Chemical', entityId: id, action: 'UPDATE', diff: b } });
    return c;
  }
  @Get('shift-reports') @RequirePermission('shift_report:read') list(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) { return this.svc.list(u, q); }
  @Get('shift-reports/:id') @RequirePermission('shift_report:read') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.get(u, id); }
  @Post('shift-reports') @RequirePermission('shift_report:create') create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(ShiftReportSchema)) b: ShiftReportInput) { return this.svc.create(u, b); }
  @Patch('shift-reports/:id') @RequirePermission('shift_report:create') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(ShiftReportSchema)) b: ShiftReportInput) { return this.svc.update(u, id, b); }
  @Post('shift-reports/:id/approve') @RequirePermission('shift_report:approve') approve(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.approve(u, id); }
  @Post('shift-reports/:id/unlock') @RequirePermission('shift_report:unlock') unlock(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(UnlockSchema)) b: { reason: string }) { return this.svc.unlock(u, id, b.reason); }
}
