import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StatusLojista } from '../../modules/lojistas/models/status-lojista';
import { StatusLojistaCache } from '../../modules/lojistas/services/status-lojista.cache';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { SOMENTE_LEITURA_PERMITIDA } from '../decorators/somente-leitura-permitida.decorator';
import { AppError } from '../errors/app.error';
import { CodigoErro } from '../errors/codigos-erro';
import { naoAutenticado } from '../errors/errors';
import type { RequestAutenticado } from './request-autenticado';

const METODOS_DE_LEITURA = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class TenantStatusGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly statusCache: StatusLojistaCache,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const alvos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, alvos)) return true;

    const req = ctx.switchToHttp().getRequest<RequestAutenticado>();
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw naoAutenticado();

    const status = await this.statusCache.obter(tenantId);
    if (!status) throw naoAutenticado();

    const escrita = !METODOS_DE_LEITURA.has(req.method.toUpperCase());
    if (
      status === StatusLojista.DESATIVADO &&
      escrita &&
      !this.reflector.getAllAndOverride<boolean>(SOMENTE_LEITURA_PERMITIDA, alvos)
    ) {
      throw new AppError(CodigoErro.LOJISTA_DESATIVADO);
    }

    req.statusLojista = status;
    return true;
  }
}
