import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { DailyReadingsService } from '../daily-readings/daily-readings.service';
import { ShiftReportsService } from '../shift-reports/shift-reports.service';
import { AttachmentsModule } from '../attachments/attachments.module';
import { JobCardsModule } from '../job-cards/job-cards.module';
@Module({ imports: [AttachmentsModule, JobCardsModule], controllers: [SyncController], providers: [DailyReadingsService, ShiftReportsService] })
export class SyncModule {}
