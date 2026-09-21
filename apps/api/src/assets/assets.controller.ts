import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { AssetSchema, AssetUpdateSchema } from '@drillex/shared';
import { AssetsService } from './assets.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';

@Controller('assets')
export class AssetsController {
  constructor(private assets: AssetsService) {}
  @Get() @RequirePermission('asset:read') list(@CurrentUser() u: AuthUser) { return this.assets.list(u); }
  @Post() @RequirePermission('asset:write') create(@Body(new ZodPipe(AssetSchema)) b: z.infer<typeof AssetSchema>, @CurrentUser() u: AuthUser) { return this.assets.create(b, u.id); }
  @Patch(':id') @RequirePermission('asset:write') update(@Param('id') id: string, @Body(new ZodPipe(AssetUpdateSchema)) b: z.infer<typeof AssetUpdateSchema>, @CurrentUser() u: AuthUser) { return this.assets.update(u, id, b); }
  @Delete(':id') @RequirePermission('asset:write') remove(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.assets.remove(u, id); }
}
