import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DailyReadingInput, DailyReadingSchema } from '@drillex/shared';
import { DailyReadingsService } from './daily-readings.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';

@Controller('daily-readings')
export class DailyReadingsController {
  constructor(private svc: DailyReadingsService) {}
  @Get() @RequirePermission('daily_reading:read') list(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) { return this.svc.list(u, q); }
  @Get(':id') @RequirePermission('daily_reading:read') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.get(u, id); }
  @Post() @RequirePermission('daily_reading:create') create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(DailyReadingSchema)) b: DailyReadingInput) { return this.svc.create(u, b); }
}
