import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RoleCreateSchema, RoleUpdateSchema, type RoleCreateInput, type RoleUpdateInput } from '@drillex/shared';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(private roles: RolesService) {}

  /** Every authenticated client fetches this to decide what to show — the same exposure the old
   *  bundled-into-every-client-JS matrix already had, just server-sourced now. */
  @Get('matrix')
  matrix() { return this.roles.getMatrix(); }

  @Get() @RequirePermission('role:manage')
  list() { return this.roles.list(); }

  @Post() @RequirePermission('role:manage')
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(RoleCreateSchema)) b: RoleCreateInput) {
    return this.roles.create(u.id, b);
  }

  @Patch(':id') @RequirePermission('role:manage')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(RoleUpdateSchema)) b: RoleUpdateInput) {
    return this.roles.update(u.id, id, b);
  }

  @Delete(':id') @RequirePermission('role:manage')
  async remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.roles.remove(u.id, id);
    return { ok: true };
  }
}
