import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { JobCardInput, JobCardSchema } from '@drillex/shared';
import { JobCardsService } from './job-cards.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';

@Controller('job-cards')
export class JobCardsController {
  constructor(private svc: JobCardsService) {}
  @Get() @RequirePermission('job_card:read') list(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) { return this.svc.list(u, q); }
  /** Picker for the technicians who can be put on a card; declared before :id so it isn't read as a card id. */
  @Get('technicians') @RequirePermission('job_card:create') technicians() { return this.svc.technicians(); }
  @Get(':id') @RequirePermission('job_card:read') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.get(u, id); }
  @Post() @RequirePermission('job_card:create') create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(JobCardSchema)) b: JobCardInput) { return this.svc.create(u, b); }
  @Patch(':id') @RequirePermission('job_card:create') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(JobCardSchema.partial())) b: Partial<JobCardInput>) { return this.svc.update(u, id, b); }
  @Post(':id/approve') @RequirePermission('job_card:approve') approve(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.approve(u, id); }
}
