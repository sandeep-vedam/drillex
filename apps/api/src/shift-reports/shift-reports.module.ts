import { Module } from '@nestjs/common';
import { ShiftReportsController } from './shift-reports.controller';
import { ShiftReportsService } from './shift-reports.service';
@Module({ controllers: [ShiftReportsController], providers: [ShiftReportsService] })
export class ShiftReportsModule {}
