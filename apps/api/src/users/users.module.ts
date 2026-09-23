import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { RolesModule } from '../roles/roles.module';
@Module({ imports: [RolesModule], controllers: [UsersController] })
export class UsersModule {}
