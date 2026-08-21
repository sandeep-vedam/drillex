import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { authenticator } from 'otplib';
import { ROLES_REQUIRING_2FA, LoginInput } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(input: LoginInput, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { employeeId: input.employeeId } });
    const ok = !!user && user.status === 'ACTIVE' && (await argon2.verify(user.passwordHash, input.password));
    await this.prisma.loginEvent.create({ data: { userId: user?.id, employeeId: input.employeeId, deviceId: input.deviceId, success: ok, ip } });
    if (!ok || !user) throw new UnauthorizedException('Invalid credentials');

    if (ROLES_REQUIRING_2FA.includes(user.role)) {
      if (!user.totpEnabled) return { requires2faSetup: true, userId: user.id };
      if (!input.totp || !authenticator.check(input.totp, user.totpSecret!)) throw new UnauthorizedException('2FA code required');
    }
    await this.prisma.device.upsert({
      where: { userId_deviceId: { userId: user.id, deviceId: input.deviceId } },
      update: { lastSeen: new Date() }, create: { userId: user.id, deviceId: input.deviceId },
    });
    return this.issueTokens(user, input.deviceId);
  }

  /** Step 1 of enrolment: verify password, create (or reuse unconfirmed) secret, return otpauth URI for the QR. */
  async setup2fa(employeeId: string, password: string) {
    const user = await this.verifyPassword(employeeId, password);
    if (user.totpEnabled) throw new UnauthorizedException('2FA already enabled');
    const secret = user.totpSecret ?? authenticator.generateSecret();
    if (!user.totpSecret) await this.prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } });
    return { otpauth: authenticator.keyuri(user.employeeId, 'Drillex Ops', secret), secret };
  }

  /** Step 2: confirm a code from the authenticator app, enable 2FA, and sign the user in. */
  async enable2fa(employeeId: string, password: string, totp: string, deviceId: string) {
    const user = await this.verifyPassword(employeeId, password);
    if (!user.totpSecret || !authenticator.check(totp, user.totpSecret)) throw new UnauthorizedException('Invalid 2FA code');
    await this.prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
    await this.prisma.auditLog.create({ data: { actorId: user.id, deviceId, entity: 'User', entityId: user.id, action: '2FA_ENABLED' } });
    return this.issueTokens(user, deviceId);
  }

  private async verifyPassword(employeeId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { employeeId } });
    if (!user || user.status !== 'ACTIVE' || !(await argon2.verify(user.passwordHash, password))) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  async refresh(refreshToken: string) {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha(refreshToken) }, include: { user: true } });
    if (!row || row.revokedAt || row.expiresAt < new Date()) throw new UnauthorizedException();
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } }); // rotation
    return this.issueTokens(row.user, row.deviceId);
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: sha(refreshToken) }, data: { revokedAt: new Date() } });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, currentPassword))) throw new UnauthorizedException('Current password is incorrect');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(newPassword), mustChangePassword: false } });
    await this.prisma.auditLog.create({ data: { actorId: userId, entity: 'User', entityId: userId, action: 'PASSWORD_CHANGED' } });
    return { ok: true };
  }

  private async issueTokens(user: { id: string; employeeId: string; role: string; siteId: string | null; mustChangePassword?: boolean }, deviceId: string) {
    const payload = { id: user.id, employeeId: user.employeeId, role: user.role, siteId: user.siteId, deviceId, mustChangePassword: !!user.mustChangePassword };
    const accessToken = await this.jwt.signAsync(payload, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: process.env.JWT_ACCESS_TTL ?? '15m' });
    const refreshToken = randomBytes(48).toString('hex');
    const days = parseInt(process.env.JWT_REFRESH_TTL ?? '30', 10) || 30;
    await this.prisma.refreshToken.create({ data: { userId: user.id, deviceId, tokenHash: sha(refreshToken), expiresAt: new Date(Date.now() + days * 864e5) } });
    return { accessToken, refreshToken, user: payload };
  }
}
