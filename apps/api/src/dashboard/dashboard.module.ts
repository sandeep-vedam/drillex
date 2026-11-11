import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { RolesModule } from '../roles/roles.module';
@Module({ imports: [RolesModule], controllers: [DashboardController] })
export class DashboardModule {}
