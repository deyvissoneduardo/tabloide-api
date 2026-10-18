import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { naoAutenticado } from '../errors/errors';
import type { RequestAutenticado } from '../guards/request-autenticado';

export function extrairTenantId(req: Partial<RequestAutenticado>): string {
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw naoAutenticado();
  return tenantId;
}

export const TenantId = createParamDecorator((_dados: unknown, ctx: ExecutionContext) =>
  extrairTenantId(ctx.switchToHttp().getRequest()),
);
