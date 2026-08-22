import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { authenticator } from 'otplib';
import { AuthService } from './auth.service';

/**
 * Unit tests for the login/2FA/device-approval rules — isolated from Postgres via a mocked
 * PrismaService. Mirrors the flows exercised manually while debugging the ADM001 2FA rollout:
 * requires2faSetup on first login, code verification on subsequent ones, device approval gating.
 */

const PASSWORD = 'Password123';
let passwordHash: string;

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-1', employeeId: 'OPR001', role: 'OPERATOR', status: 'ACTIVE',
    passwordHash, siteId: 'site-1', totpEnabled: false, totpSecret: null,
    mustChangePassword: false,
    ...overrides,
  };
}

function makePrisma(user: ReturnType<typeof makeUser> | null) {
  return {
    user: { findUnique: vi.fn().mockResolvedValue(user), update: vi.fn().mockResolvedValue(user) },
    loginEvent: { create: vi.fn().mockResolvedValue({}) },
    device: { upsert: vi.fn().mockResolvedValue({ approved: true }) },
    refreshToken: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

function makeJwt() {
  return { signAsync: vi.fn().mockResolvedValue('signed-jwt') };
}

beforeEach(async () => {
  passwordHash = await argon2.hash(PASSWORD);
  delete process.env.DEVICE_REGISTRATION_REQUIRED;
});

describe('AuthService.login', () => {
  it('rejects an unknown employee ID, and still logs the failed attempt', async () => {
    const prisma = makePrisma(null);
    const svc = new AuthService(prisma as never, makeJwt() as never);
    await expect(svc.login({ employeeId: 'NOBODY', password: PASSWORD, deviceId: 'd1' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.loginEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ employeeId: 'NOBODY', success: false }),
    }));
  });

  it('rejects a wrong password, and still logs the failed attempt', async () => {
    const prisma = makePrisma(makeUser());
    const svc = new AuthService(prisma as never, makeJwt() as never);
    await expect(svc.login({ employeeId: 'OPR001', password: 'wrong', deviceId: 'd1' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.loginEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ success: false }),
    }));
  });

  it('rejects a correct password for a non-ACTIVE (e.g. suspended) user', async () => {
    const prisma = makePrisma(makeUser({ status: 'SUSPENDED' }));
    const svc = new AuthService(prisma as never, makeJwt() as never);
    await expect(svc.login({ employeeId: 'OPR001', password: PASSWORD, deviceId: 'd1' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logs in a role that does not require 2FA with no totp code needed', async () => {
    const prisma = makePrisma(makeUser());
    const svc = new AuthService(prisma as never, makeJwt() as never);
    const r = await svc.login({ employeeId: 'OPR001', password: PASSWORD, deviceId: 'd1' });
    expect(r).toHaveProperty('accessToken', 'signed-jwt');
    expect(r).toHaveProperty('refreshToken');
  });

  it('returns requires2faSetup for a manager/admin who has never enrolled, without issuing tokens', async () => {
    const prisma = makePrisma(makeUser({ role: 'ADMIN', totpEnabled: false }));
    const svc = new AuthService(prisma as never, makeJwt() as never);
    const r = await svc.login({ employeeId: 'ADM001', password: PASSWORD, deviceId: 'd1' });
    expect(r).toEqual({ requires2faSetup: true, userId: 'user-1' });
  });

  it('rejects an enrolled admin login with no totp code supplied', async () => {
    const secret = authenticator.generateSecret();
    const prisma = makePrisma(makeUser({ role: 'ADMIN', totpEnabled: true, totpSecret: secret }));
    const svc = new AuthService(prisma as never, makeJwt() as never);
    await expect(svc.login({ employeeId: 'ADM001', password: PASSWORD, deviceId: 'd1' }))
      .rejects.toThrow('2FA code required');
  });

  it('rejects an enrolled admin login with a wrong/expired totp code', async () => {
    const secret = authenticator.generateSecret();
    const prisma = makePrisma(makeUser({ role: 'ADMIN', totpEnabled: true, totpSecret: secret }));
    const svc = new AuthService(prisma as never, makeJwt() as never);
    await expect(svc.login({ employeeId: 'ADM001', password: PASSWORD, deviceId: 'd1', totp: '000000' }))
      .rejects.toThrow('2FA code required');
  });

  it('logs in an enrolled admin with the correct live totp code', async () => {
    const secret = authenticator.generateSecret();
    const prisma = makePrisma(makeUser({ role: 'ADMIN', totpEnabled: true, totpSecret: secret }));
    const svc = new AuthService(prisma as never, makeJwt() as never);
    const r = await svc.login({ employeeId: 'ADM001', password: PASSWORD, deviceId: 'd1', totp: authenticator.generate(secret) });
    expect(r).toHaveProperty('accessToken', 'signed-jwt');
  });

  it('blocks login from an unapproved device when device registration is required', async () => {
    process.env.DEVICE_REGISTRATION_REQUIRED = 'true';
    const prisma = makePrisma(makeUser());
    prisma.device.upsert.mockResolvedValue({ approved: false });
    const svc = new AuthService(prisma as never, makeJwt() as never);
    await expect(svc.login({ employeeId: 'OPR001', password: PASSWORD, deviceId: 'new-device' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows login from an approved device when device registration is required', async () => {
    process.env.DEVICE_REGISTRATION_REQUIRED = 'true';
    const prisma = makePrisma(makeUser());
    prisma.device.upsert.mockResolvedValue({ approved: true });
    const svc = new AuthService(prisma as never, makeJwt() as never);
    const r = await svc.login({ employeeId: 'OPR001', password: PASSWORD, deviceId: 'known-device' });
    expect(r).toHaveProperty('accessToken');
  });
});

describe('AuthService.setup2fa', () => {
  it('rejects a wrong password before touching totp state', async () => {
    const prisma = makePrisma(makeUser({ role: 'ADMIN' }));
    const svc = new AuthService(prisma as never, makeJwt() as never);
    await expect(svc.setup2fa('ADM001', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects re-enrolling a user who already has 2FA enabled', async () => {
    const prisma = makePrisma(makeUser({ role: 'ADMIN', totpEnabled: true, totpSecret: authenticator.generateSecret() }));
    const svc = new AuthService(prisma as never, makeJwt() as never);
    await expect(svc.setup2fa('ADM001', PASSWORD)).rejects.toThrow('2FA already enabled');
  });

  it('generates and persists a fresh secret for a first-time enrolment', async () => {
    const prisma = makePrisma(makeUser({ role: 'ADMIN', totpEnabled: false, totpSecret: null }));
    const svc = new AuthService(prisma as never, makeJwt() as never);
    const r = await svc.setup2fa('ADM001', PASSWORD);
    expect(r.secret).toBeTruthy();
    expect(r.otpauth).toContain('otpauth://');
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { totpSecret: r.secret } }));
  });

  it('reuses an existing unconfirmed secret instead of overwriting it (idempotent re-setup)', async () => {
    const existing = authenticator.generateSecret();
    const prisma = makePrisma(makeUser({ role: 'ADMIN', totpEnabled: false, totpSecret: existing }));
    const svc = new AuthService(prisma as never, makeJwt() as never);
    const r = await svc.setup2fa('ADM001', PASSWORD);
    expect(r.secret).toBe(existing);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('AuthService.enable2fa', () => {
  it('rejects an invalid confirmation code and leaves totpEnabled false', async () => {
    const secret = authenticator.generateSecret();
    const prisma = makePrisma(makeUser({ role: 'ADMIN', totpEnabled: false, totpSecret: secret }));
    const svc = new AuthService(prisma as never, makeJwt() as never);
    await expect(svc.enable2fa('ADM001', PASSWORD, '000000', 'd1')).rejects.toThrow('Invalid 2FA code');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects confirmation when no secret was ever generated', async () => {
    const prisma = makePrisma(makeUser({ role: 'ADMIN', totpEnabled: false, totpSecret: null }));
    const svc = new AuthService(prisma as never, makeJwt() as never);
    await expect(svc.enable2fa('ADM001', PASSWORD, '123456', 'd1')).rejects.toThrow('Invalid 2FA code');
  });

  it('enables 2FA, audit-logs it, and signs the user in on a correct code', async () => {
    const secret = authenticator.generateSecret();
    const prisma = makePrisma(makeUser({ role: 'ADMIN', totpEnabled: false, totpSecret: secret }));
    const svc = new AuthService(prisma as never, makeJwt() as never);
    const r = await svc.enable2fa('ADM001', PASSWORD, authenticator.generate(secret), 'd1');
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { totpEnabled: true } }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: '2FA_ENABLED' }),
    }));
    expect(r).toHaveProperty('accessToken', 'signed-jwt');
  });
});
