import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, Observable, switchMap } from 'rxjs';
import type { RequestAutenticado } from '../../../common/guards/request-autenticado';
import { RegistroAcessoPainelService } from '../services/registro-acesso-painel.service';

/**
 * Global: toda requisição de lojista autenticado (req.user definido pelo JwtAuthGuard) gera um registro
 * de acesso antes do handler. Rotas públicas e admin não têm req.user e passam direto.
 */
@Injectable()
export class RegistroAcessoPainelInterceptor implements NestInterceptor {
  constructor(private readonly registro: RegistroAcessoPainelService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<RequestAutenticado>();
    const tenantId = req.user?.tenantId;
    if (!tenantId) return next.handle();
    return from(
      this.registro.registrar({ tenantId, ip: req.ip, metodo: req.method, url: req.originalUrl ?? req.url }),
    ).pipe(switchMap(() => next.handle()));
  }
}
