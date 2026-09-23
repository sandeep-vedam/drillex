import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { RolesModule } from '../roles/roles.module';
@Module({ imports: [RolesModule], controllers: [AttachmentsController], providers: [AttachmentsService], exports: [AttachmentsService] })
export class AttachmentsModule {}
