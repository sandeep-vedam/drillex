import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportBuildersService } from './report-builders.service';
import { ReportRendererService } from './report-renderer.service';
@Module({ controllers: [ReportsController], providers: [ReportsService, ReportBuildersService, ReportRendererService] })
export class ReportsModule {}
