import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, Permission } from '@drillex/shared';
import { REQUIRE_PERMISSION, IS_PUBLIC } from './decorators';

/** Enforces the shared RBAC matrix at the API level (SRS §9.3). Attaches scope to req.user. */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const perm = this.reflector.getAllAndOverride<Permission>(REQUIRE_PERMISSION, [ctx.getHandler(), ctx.getClass()]);
    if (!perm) return true;
    const req = ctx.switchToHttp().getRequest();
    const scope = can(req.user?.role, perm);
    if (!scope) throw new ForbiddenException(`Missing permission ${perm}`);
    req.user.scope = scope;
    return true;
  }
}
