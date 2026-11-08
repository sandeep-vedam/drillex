import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { authenticator } from 'otplib';
import { ACCOUNT_SUSPENDED_MESSAGE, credentialProblem, LoginInput, MAX_FAILED_LOGINS } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { getPinRoles, getRoles2faRequired } from '../settings/settings.util';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
/** Refresh tokens live 7 days (client spec §10.8) unless JWT_REFRESH_TTL says otherwise ("7d" or "7"). */
export const refreshDays = () => parseInt(process.env.JWT_REFRESH_TTL ?? '7', 10) || 7;

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  /**
   * Blocked, suspended and deactivated accounts receive no token (client spec §10.3). Five wrong credentials in a row
   * suspend the account until an admin unlocks it (§10.8). A temporary PIN / password stops working after 24 hours.
   */
  async login(input: LoginInput, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { employeeId: input.employeeId } });
    const fail = async () => this.prisma.loginEvent.create({ data: { userId: user?.id, employeeId: input.employeeId, deviceId: input.deviceId, success: false, ip } });
    if (!user) { await fail(); throw new UnauthorizedException('Invalid credentials'); }
    if (user.status !== 'ACTIVE') { await fail(); throw new ForbiddenException(ACCOUNT_SUSPENDED_MESSAGE); }
    if (!(await argon2.verify(user.passwordHash, input.password))) {
      await fail();
      const failedLogins = user.failedLogins + 1;
      if (failedLogins >= MAX_FAILED_LOGINS) {
        await this.prisma.$transaction([
          this.prisma.user.update({ where: { id: user.id }, data: { failedLogins, status: 'SUSPENDED', statusReason: `Locked after ${failedLogins} failed sign-in attempts`, statusChangedAt: new Date() } }),
          this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
          this.prisma.auditLog.create({ data: { actorId: null, deviceId: input.deviceId, entity: 'User', entityId: user.id, action: 'LOCKED_OUT', diff: { failedLogins, ip } as never } }),
        ]);
        throw new ForbiddenException(ACCOUNT_SUSPENDED_MESSAGE);
      }
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins } });
      const left = MAX_FAILED_LOGINS - failedLogins;
      throw new UnauthorizedException(left <= 2 ? `Invalid credentials. ${left} attempt${left === 1 ? '' : 's'} left before the account is locked.` : 'Invalid credentials');
    }
    if (user.mustChangePassword && user.tempCredentialExpiresAt && user.tempCredentialExpiresAt < new Date()) {
      await fail();
      throw new UnauthorizedException('This temporary PIN has expired. Ask your administrator for a new one.');
    }
    await this.prisma.loginEvent.create({ data: { userId: user.id, employeeId: input.employeeId, deviceId: input.deviceId, success: true, ip } });
    if (user.failedLogins) await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0 } });

    if ((await getRoles2faRequired(this.prisma)).includes(user.role)) {
      if (!user.totpEnabled) return { requires2faSetup: true, userId: user.id };
      if (!input.totp || !authenticator.check(input.totp, user.totpSecret!)) throw new UnauthorizedException('2FA code required');
    }
    const required = process.env.DEVICE_REGISTRATION_REQUIRED === 'true';
    const device = await this.prisma.device.upsert({
      where: { userId_deviceId: { userId: user.id, deviceId: input.deviceId } },
      update: { lastSeen: new Date() }, create: { userId: user.id, deviceId: input.deviceId, approved: !required },
    });
    if (required && !device.approved) throw new ForbiddenException('This device is not approved. Ask your administrator to approve it.');
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

  async registerPushToken(u: { id: string; deviceId: string }, pushToken: string, platform?: string) {
    await this.prisma.device.upsert({ where: { userId_deviceId: { userId: u.id, deviceId: u.deviceId } }, update: { pushToken, platform, lastSeen: new Date() }, create: { userId: u.id, deviceId: u.deviceId, pushToken, platform } });
    return { ok: true };
  }

  async refresh(refreshToken: string) {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha(refreshToken) }, include: { user: true } });
    if (!row || row.revokedAt || row.expiresAt < new Date()) throw new UnauthorizedException();
    if (row.user.status !== 'ACTIVE') { await this.revokeAll(row.userId); throw new UnauthorizedException(ACCOUNT_SUSPENDED_MESSAGE); }
    if (process.env.DEVICE_REGISTRATION_REQUIRED === 'true') { const dev = await this.prisma.device.findUnique({ where: { userId_deviceId: { userId: row.userId, deviceId: row.deviceId } } }); if (!dev?.approved) throw new ForbiddenException('Device not approved'); }
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } }); // rotation
    await this.prisma.auditLog.create({ data: { actorId: row.userId, deviceId: row.deviceId, entity: 'Auth', entityId: row.userId, action: 'TOKEN_REFRESH' } });
    return this.issueTokens(row.user, row.deviceId);
  }

  async logout(refreshToken: string) {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha(refreshToken) } });
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: sha(refreshToken) }, data: { revokedAt: new Date() } });
    if (row) await this.prisma.auditLog.create({ data: { actorId: row.userId, deviceId: row.deviceId, entity: 'Auth', entityId: row.userId, action: 'LOGOUT' } });
  }

  /** Every session for the user ends: used on block, suspend and credential reset (client spec §10.8). */
  async revokeAll(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** Whether this person signs in with a PIN (field roles) or a password (office roles). */
  async usesPin(role: string) { return (await getPinRoles(this.prisma)).includes(role); }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const pin = await this.usesPin(user.role);
    if (!(await argon2.verify(user.passwordHash, currentPassword))) throw new UnauthorizedException(`Current ${pin ? 'PIN' : 'password'} is incorrect`);
    const problem = credentialProblem(newPassword, pin);
    if (problem) throw new BadRequestException(problem);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(newPassword), mustChangePassword: false, tempCredentialExpiresAt: null } });
    await this.prisma.auditLog.create({ data: { actorId: userId, entity: 'User', entityId: userId, action: pin ? 'PIN_CHANGED' : 'PASSWORD_CHANGED' } });
    return { ok: true };
  }

  private async issueTokens(user: { id: string; employeeId: string; role: string; siteId: string | null; mustChangePassword?: boolean }, deviceId: string) {
    const payload = { id: user.id, employeeId: user.employeeId, role: user.role, siteId: user.siteId, deviceId, mustChangePassword: !!user.mustChangePassword, usesPin: await this.usesPin(user.role) };
    const accessToken = await this.jwt.signAsync(payload, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: process.env.JWT_ACCESS_TTL ?? '15m' });
    const refreshToken = randomBytes(48).toString('hex');
    const days = refreshDays();
    await this.prisma.refreshToken.create({ data: { userId: user.id, deviceId, tokenHash: sha(refreshToken), expiresAt: new Date(Date.now() + days * 864e5) } });
    return { accessToken, refreshToken, user: payload };
  }
}
