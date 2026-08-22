import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AttachmentsService } from './attachments.service';
import { AuthUser, CurrentUser } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';

export const AttachmentSchema = z.object({ id: z.string().uuid().optional(), ownerType: z.enum(['DailyReading', 'ShiftReport', 'JobCard', 'Asset']), ownerId: z.string().uuid(), kind: z.enum(['PHOTO', 'DOCUMENT', 'SIGNATURE']), contentType: z.string(), base64: z.string().min(10) });

@Controller('attachments')
export class AttachmentsController {
  constructor(private svc: AttachmentsService) {}
  @Post() upload(@CurrentUser() u: AuthUser, @Body(new ZodPipe(AttachmentSchema)) b: z.infer<typeof AttachmentSchema>) { return this.svc.upload(u, b); }
  @Get() list(@CurrentUser() u: AuthUser, @Query('ownerType') t: string, @Query('ownerId') id: string) { return this.svc.listFor(u, t, id); }
}
