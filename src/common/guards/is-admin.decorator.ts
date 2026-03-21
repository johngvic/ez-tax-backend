import { UseGuards, applyDecorators } from '@nestjs/common';
import { IsAdminGuard } from './IsAdminGuard';

export function IsAdmin() {
  return applyDecorators(UseGuards(IsAdminGuard));
}
