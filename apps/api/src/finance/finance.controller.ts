import { Body, Controller, Get, Header, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ClientSchema, DaysWorkedSchema, DeploymentSchema, PaymentSchema, ReviewSchema, type DaysWorkedInput, type DeploymentInput, type PaymentInput } from '@drillex/shared';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { RolesModule } from '../roles/roles.module';
import { FinanceService } from './finance.service';

type Q = Record<string, string>;
const READ = ['finance:read', 'plant_hire:write'] as const;
const WRITE = ['finance:write', 'plant_hire:write'] as const;
type Review = z.infer<typeof ReviewSchema>;

/**
 * Finance & plant hire API (client spec §6, §11.6). The spec's /plant/* paths live here under /finance, shared by
 * the Finance Manager and the Plant Hire Supervisor; the service narrows what each one sees and may change.
 */
@Controller('finance')
export class FinanceController {
  constructor(private svc: FinanceService) {}

  @Get('access') @RequirePermission(...READ) access(@CurrentUser() u: AuthUser) { return this.svc.access(u); }

  @Get('clients') @RequirePermission(...READ) clients(@Query() q: Q) { return this.svc.listClients(q); }
  @Post('clients') @RequirePermission(...WRITE) createClient(@CurrentUser() u: AuthUser, @Body(new ZodPipe(ClientSchema)) b: z.infer<typeof ClientSchema>) { return this.svc.createClient(u, b); }
  @Patch('clients/:id') @RequirePermission('finance:write') updateClient(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(ClientSchema.partial())) b: Partial<z.infer<typeof ClientSchema>>) { return this.svc.updateClient(u, id, b); }

  @Get('machines') @RequirePermission(...READ) machines(@CurrentUser() u: AuthUser) { return this.svc.machines(u); }
  /** Current client of a machine for the operator's Client Tracker — dates only, no amounts. */
  @Get('current') @RequirePermission('asset:read') current(@CurrentUser() u: AuthUser, @Query('assetId') assetId: string) { return this.svc.current(u, assetId); }

  @Get('deployments') @RequirePermission(...READ) deployments(@CurrentUser() u: AuthUser, @Query() q: Q) { return this.svc.listDeployments(u, q); }
  @Get('deployments/:id') @RequirePermission(...READ) deployment(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.getDeployment(u, id); }
  @Post('deployments') @RequirePermission(...WRITE) createDeployment(@CurrentUser() u: AuthUser, @Body(new ZodPipe(DeploymentSchema)) b: DeploymentInput) { return this.svc.createDeployment(u, b); }
  @Patch('deployments/:id') @RequirePermission(...WRITE) updateDeployment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(DeploymentSchema)) b: DeploymentInput) { return this.svc.updateDeployment(u, id, b); }
  @Post('deployments/:id/review') @RequirePermission('finance:review') reviewDeployment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(ReviewSchema)) b: Review) { return this.svc.review(u, 'deployment', id, b.decision, b.reason); }

  @Get('days-worked') @RequirePermission(...READ) days(@CurrentUser() u: AuthUser, @Query() q: Q) { return this.svc.listDays(u, q); }
  @Post('days-worked') @RequirePermission(...WRITE) createDays(@CurrentUser() u: AuthUser, @Body(new ZodPipe(DaysWorkedSchema)) b: DaysWorkedInput) { return this.svc.createDays(u, b); }
  @Patch('days-worked/:id') @RequirePermission(...WRITE) updateDays(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(DaysWorkedSchema)) b: DaysWorkedInput) { return this.svc.updateDays(u, id, b); }
  @Post('days-worked/:id/review') @RequirePermission('finance:review') reviewDays(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(ReviewSchema)) b: Review) { return this.svc.review(u, 'daysWorked', id, b.decision, b.reason); }

  @Get('payments') @RequirePermission(...READ) payments(@CurrentUser() u: AuthUser, @Query() q: Q) { return this.svc.listPayments(u, q); }
  @Post('payments') @RequirePermission(...WRITE) createPayment(@CurrentUser() u: AuthUser, @Body(new ZodPipe(PaymentSchema)) b: PaymentInput) { return this.svc.createPayment(u, b); }
  @Patch('payments/:id') @RequirePermission('finance:write') updatePayment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(PaymentSchema)) b: PaymentInput) { return this.svc.updatePayment(u, id, b); }
  @Post('payments/:id/review') @RequirePermission('finance:review') reviewPayment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(ReviewSchema)) b: Review) { return this.svc.review(u, 'payment', id, b.decision, b.reason); }

  @Get('reviews') @RequirePermission('finance:review', 'plant_hire:write') reviews(@CurrentUser() u: AuthUser) { return this.svc.reviewQueue(u); }
  @Get('dashboard') @RequirePermission(...READ) dashboard(@CurrentUser() u: AuthUser) { return this.svc.dashboard(u); }
  @Get('alerts') @RequirePermission(...READ) alerts(@CurrentUser() u: AuthUser) { return this.svc.alerts(u); }
  @Get('summary') @RequirePermission(...READ) summary(@CurrentUser() u: AuthUser, @Query() q: Q) { return this.svc.summary(u, q); }
  @Get('summary.csv') @RequirePermission(...READ) @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="client-summary.csv"')
  summaryCsv(@CurrentUser() u: AuthUser, @Query() q: Q) { return this.svc.summaryCsv(u, q); }
  @Get('monthly') @RequirePermission(...READ) monthly(@CurrentUser() u: AuthUser, @Query('month') month: string) { return this.svc.monthly(u, month); }
}

@Module({ imports: [RolesModule], controllers: [FinanceController], providers: [FinanceService], exports: [FinanceService] })
export class FinanceModule {}
