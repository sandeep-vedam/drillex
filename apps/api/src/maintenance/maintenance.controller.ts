import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CompleteServiceSchema, MaintenanceScheduleInput, MaintenanceScheduleSchema } from '@drillex/shared';
import { MaintenanceService } from './maintenance.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';

@Controller('maintenance')
export class MaintenanceController {
  constructor(private svc: MaintenanceService) {}
  @Get('schedules') @RequirePermission('maintenance:read') list(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) { return this.svc.list(u, q); }
  @Post('schedules') @RequirePermission('maintenance:write') create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(MaintenanceScheduleSchema)) b: MaintenanceScheduleInput) { return this.svc.create(u, b); }
  @Patch('schedules/:id') @RequirePermission('maintenance:write') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: Partial<MaintenanceScheduleInput>) { return this.svc.update(u, id, b); }
  @Delete('schedules/:id') @RequirePermission('maintenance:write') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.remove(u, id); }
  @Post('schedules/:id/complete') @RequirePermission('maintenance:complete') complete(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(CompleteServiceSchema)) b: z.infer<typeof CompleteServiceSchema>) { return this.svc.complete(u, id, b); }
  /** Manual triggers for the scheduled jobs (managers) — handy for ops and tests. */
  @Post('jobs/reminders') @RequirePermission('maintenance:write') reminders() { return this.svc.runReminders(); }
  @Post('jobs/weekly-digest') @RequirePermission('report:generate') digest() { return this.svc.runWeeklyDigest(); }
}
