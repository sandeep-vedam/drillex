import { Module } from '@nestjs/common';
import { RequestsModule } from '../requests/requests.controller';
import { RolesModule } from '../roles/roles.module';
import { SyncController } from './sync.controller';
import { DailyReadingsService } from '../daily-readings/daily-readings.service';
import { ShiftReportsService } from '../shift-reports/shift-reports.service';
import { AttachmentsModule } from '../attachments/attachments.module';
import { JobCardsModule } from '../job-cards/job-cards.module';
import { FinanceModule } from '../finance/finance.controller';
@Module({ imports: [AttachmentsModule, JobCardsModule, RolesModule, RequestsModule, FinanceModule], controllers: [SyncController], providers: [DailyReadingsService, ShiftReportsService] })
export class SyncModule {}
