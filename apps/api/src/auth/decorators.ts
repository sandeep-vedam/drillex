import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@drillex/shared';
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const REQUIRE_PERMISSION = 'requirePermission';
/** Any one of the listed permissions admits the request; the first one the role holds sets `scope`. */
export const RequirePermission = (...p: [Permission, ...Permission[]]) => SetMetadata(REQUIRE_PERMISSION, p);
export interface AuthUser { id: string; employeeId: string; role: import('@drillex/shared').Role; siteId: string | null; deviceId: string; scope?: import('@drillex/shared').Scope }
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);
