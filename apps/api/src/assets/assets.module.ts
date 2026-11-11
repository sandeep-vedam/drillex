import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { RolesModule } from '../roles/roles.module';
@Module({ imports: [RolesModule], controllers: [AssetsController], providers: [AssetsService] })
export class AssetsModule {}
