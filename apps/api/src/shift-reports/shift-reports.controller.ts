import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ShiftReportInput, ShiftReportSchema } from '@drillex/shared';
import { ShiftReportsService } from './shift-reports.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

const UnlockSchema = z.object({ reason: z.string().min(3) });

@Controller()
export class ShiftReportsController {
  constructor(private svc: ShiftReportsService, private prisma: PrismaService) {}
  @Get('chemicals') chemicals() { return this.prisma.chemical.findMany({ orderBy: { name: 'asc' } }); }
  @Get('shift-reports') @RequirePermission('shift_report:read') list(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) { return this.svc.list(u, q); }
  @Get('shift-reports/:id') @RequirePermission('shift_report:read') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.get(u, id); }
  @Post('shift-reports') @RequirePermission('shift_report:create') create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(ShiftReportSchema)) b: ShiftReportInput) { return this.svc.create(u, b); }
  @Patch('shift-reports/:id') @RequirePermission('shift_report:create') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(ShiftReportSchema)) b: ShiftReportInput) { return this.svc.update(u, id, b); }
  @Post('shift-reports/:id/approve') @RequirePermission('shift_report:approve') approve(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.approve(u, id); }
  @Post('shift-reports/:id/unlock') @RequirePermission('shift_report:unlock') unlock(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(UnlockSchema)) b: { reason: string }) { return this.svc.unlock(u, id, b.reason); }
}
