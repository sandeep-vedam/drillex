import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators';
@Controller('health')
export class HealthController {
  @Public() @Get() get() { return { ok: true, ts: new Date().toISOString() }; }
}
