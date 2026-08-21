import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { DailyReadingsService } from '../daily-readings/daily-readings.service';
import { ShiftReportsService } from '../shift-reports/shift-reports.service';
import { AttachmentsModule } from '../attachments/attachments.module';
@Module({ imports: [AttachmentsModule], controllers: [SyncController], providers: [DailyReadingsService, ShiftReportsService] })
export class SyncModule {}
