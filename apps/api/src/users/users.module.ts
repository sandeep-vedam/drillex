import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { RolesModule } from '../roles/roles.module';
import { AuthModule } from '../auth/auth.module';
@Module({ imports: [RolesModule, AuthModule], controllers: [UsersController] })
export class UsersModule {}
