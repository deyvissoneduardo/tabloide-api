import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { TIPO_TOKEN_LOJISTA, type PayloadToken } from '../auth/payload-token';
import { ClockService } from '../clock/clock.service';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { naoAutenticado } from '../errors/errors';
import { TenantContext } from '../tenant/tenant-context';
import type { RequestAutenticado } from './request-autenticado';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly clock: ClockService,
    private readonly tenantContext: TenantContext,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;

    const req = ctx.switchToHttp().getRequest<RequestAutenticado>();
    const [esquema, token] = (req.headers.authorization ?? '').split(' ');
    if (esquema !== 'Bearer' || !token) throw naoAutenticado();

    let payload: PayloadToken;
    try {
      payload = this.jwt.verify<PayloadToken>(token, {
        algorithms: ['HS256'],
        clockTimestamp: Math.floor(this.clock.agora().getTime() / 1000),
      });
    } catch {
      throw naoAutenticado();
    }
    if (payload.typ !== TIPO_TOKEN_LOJISTA || typeof payload.sub !== 'string' || !payload.sub)
      throw naoAutenticado();

    req.user = { tenantId: payload.sub };
    this.tenantContext.definir(payload.sub);
    return true;
  }
}
