import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ACCOUNT_SUSPENDED_MESSAGE } from '@drillex/shared';
import { IS_PUBLIC } from './decorators';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService, private prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException();
    try {
      req.user = await this.jwt.verifyAsync(token, { secret: process.env.JWT_ACCESS_SECRET });
    } catch { throw new UnauthorizedException(); }
    // A block takes effect on the very next request, not when the 15-minute token runs out (client spec §10.3).
    // 401 rather than 403, so the apps try to refresh — which also fails — and drop the session.
    const u = await this.prisma.user.findUnique({ where: { id: req.user.id }, select: { status: true } });
    if (!u || u.status !== 'ACTIVE') throw new UnauthorizedException(ACCOUNT_SUSPENDED_MESSAGE);
    return true;
  }
}
