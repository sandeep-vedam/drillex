import { Module } from '@nestjs/common';
import { DailyReadingsController } from './daily-readings.controller';
import { DailyReadingsService } from './daily-readings.service';
@Module({ controllers: [DailyReadingsController], providers: [DailyReadingsService] })
export class DailyReadingsModule {}
