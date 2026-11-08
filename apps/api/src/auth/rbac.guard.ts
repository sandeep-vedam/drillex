import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, Permission } from '@drillex/shared';
import { REQUIRE_PERMISSION, IS_PUBLIC } from './decorators';
import { RolesService } from '../roles/roles.service';

/** Enforces the database-backed RBAC matrix at the API level (SRS §9.3). Attaches scope to req.user. */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private reflector: Reflector, private roles: RolesService) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const perms = this.reflector.getAllAndOverride<Permission[]>(REQUIRE_PERMISSION, [ctx.getHandler(), ctx.getClass()]);
    if (!perms?.length) return true;
    const req = ctx.switchToHttp().getRequest();
    const matrix = await this.roles.getMatrix();
    const scope = perms.map((p) => can(matrix, req.user?.role, p)).find(Boolean);
    if (!scope) throw new ForbiddenException(`Missing permission ${perms.join(' or ')}`);
    req.user.scope = scope;
    return true;
  }
}
