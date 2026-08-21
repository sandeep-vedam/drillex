import { Module } from '@nestjs/common';
import { JobCardsController } from './job-cards.controller';
import { JobCardsService } from './job-cards.service';
@Module({ controllers: [JobCardsController], providers: [JobCardsService], exports: [JobCardsService] })
export class JobCardsModule {}
