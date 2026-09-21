import { Controller, Get } from '@nestjs/common';

// Unauthenticated liveness probe for Render's health check.
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
