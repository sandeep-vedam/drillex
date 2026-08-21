import { Module } from '@nestjs/common';
import { PartsController } from './parts.controller';
@Module({ controllers: [PartsController] })
export class PartsModule {}
