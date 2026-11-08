import { Module } from '@nestjs/common';
import { RolesModule } from '../roles/roles.module';
import { ShiftReportsController } from './shift-reports.controller';
import { ShiftReportsService } from './shift-reports.service';
@Module({ imports: [RolesModule], controllers: [ShiftReportsController], providers: [ShiftReportsService] })
export class ShiftReportsModule {}
