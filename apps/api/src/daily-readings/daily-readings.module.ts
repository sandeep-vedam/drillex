import { Module } from '@nestjs/common';
import { RolesModule } from '../roles/roles.module';
import { DailyReadingsController } from './daily-readings.controller';
import { DailyReadingsService } from './daily-readings.service';
@Module({ imports: [RolesModule], controllers: [DailyReadingsController], providers: [DailyReadingsService] })
export class DailyReadingsModule {}
