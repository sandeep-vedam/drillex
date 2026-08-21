import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { ChangePasswordSchema, LoginSchema } from '@drillex/shared';
import { AuthService } from './auth.service';
import { CurrentUser, Public, AuthUser } from './decorators';
import { ZodPipe } from '../common/zod.pipe';

const RefreshSchema = z.object({ refreshToken: z.string().min(10) });
const PushTokenSchema = z.object({ pushToken: z.string().min(10), platform: z.enum(['android', 'ios', 'web']).optional() });
const SetupSchema = z.object({ employeeId: z.string().min(1), password: z.string().min(8) });
const EnableSchema = SetupSchema.extend({ totp: z.string().length(6), deviceId: z.string().min(1) });

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  @Public() @Throttle({ default: { ttl: 60_000, limit: 10 } }) @Post('login') login(@Body(new ZodPipe(LoginSchema)) body: z.infer<typeof LoginSchema>, @Ip() ip: string) { return this.auth.login(body, ip); }
  @Public() @Post('refresh') refresh(@Body(new ZodPipe(RefreshSchema)) b: { refreshToken: string }) { return this.auth.refresh(b.refreshToken); }
  @Public() @Post('2fa/setup') setup(@Body(new ZodPipe(SetupSchema)) b: z.infer<typeof SetupSchema>) { return this.auth.setup2fa(b.employeeId, b.password); }
  @Public() @Post('2fa/enable') enable(@Body(new ZodPipe(EnableSchema)) b: z.infer<typeof EnableSchema>) { return this.auth.enable2fa(b.employeeId, b.password, b.totp, b.deviceId); }
  @Post('logout') logout(@Body(new ZodPipe(RefreshSchema)) b: { refreshToken: string }) { return this.auth.logout(b.refreshToken); }
  @Post('change-password') change(@Body(new ZodPipe(ChangePasswordSchema)) b: z.infer<typeof ChangePasswordSchema>, @CurrentUser() u: AuthUser) { return this.auth.changePassword(u.id, b.currentPassword, b.newPassword); }
  @Post('push-token') pushToken(@Body(new ZodPipe(PushTokenSchema)) b: z.infer<typeof PushTokenSchema>, @CurrentUser() u: AuthUser) { return this.auth.registerPushToken(u, b.pushToken, b.platform); }
  @Get('me') me(@CurrentUser() u: AuthUser) { return u; }
}
