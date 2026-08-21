import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ReportsService } from './reports.service';
import { REPORT_TYPES } from './report-types';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';

const RangeSchema = z.object({ type: z.enum(REPORT_TYPES), from: z.coerce.date(), to: z.coerce.date() }).refine((r) => r.to >= r.from, { message: 'to must be after from' });
const EmailSchema = z.object({ to: z.array(z.string().email()).min(1), message: z.string().optional() });

@Controller('reports')
export class ReportsController {
  constructor(private svc: ReportsService) {}
  @Get('types') @RequirePermission('report:read') types(@CurrentUser() u: AuthUser) { return this.svc.types(u); }
  @Get('preview') @RequirePermission('report:read') preview(@CurrentUser() u: AuthUser, @Query(new ZodPipe(RangeSchema)) q: z.infer<typeof RangeSchema>) { return this.svc.preview(u, q.type, q.from, q.to); }
  @Post('generate') @RequirePermission('report:read') generate(@CurrentUser() u: AuthUser, @Body(new ZodPipe(RangeSchema)) b: z.infer<typeof RangeSchema>) { return this.svc.generate(u, b.type, b.from, b.to, u.scope === 'site' ? u.siteId : null); }
  @Get() @RequirePermission('report:read') archive(@CurrentUser() u: AuthUser) { return this.svc.archive(u); }
  @Post(':id/email') @RequirePermission('report:read') email(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(EmailSchema)) b: z.infer<typeof EmailSchema>) { return this.svc.email(u, id, b.to, b.message); }
  @Post('jobs/month-end') @RequirePermission('report:generate') monthEnd(@Body() b: { ref?: string }) { return this.svc.runMonthEnd(b?.ref ? new Date(b.ref) : new Date()); }
}
