import { Body, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { AssetSchema } from '@drillex/shared';
import { AssetsService } from './assets.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';

@Controller('assets')
export class AssetsController {
  constructor(private assets: AssetsService) {}
  @Get() @RequirePermission('asset:read') list(@CurrentUser() u: AuthUser) { return this.assets.list(u); }
  @Post() @RequirePermission('asset:write') create(@Body(new ZodPipe(AssetSchema)) b: z.infer<typeof AssetSchema>, @CurrentUser() u: AuthUser) { return this.assets.create(b, u.id); }
}
