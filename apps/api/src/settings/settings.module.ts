import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { RolesModule } from '../roles/roles.module';
@Module({ imports: [RolesModule], controllers: [SettingsController] })
export class SettingsModule {}
