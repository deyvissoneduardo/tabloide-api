import { createHash, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { naoEncontrado } from '../errors/errors';
import type { RequestAutenticado } from './request-autenticado';

const sha256 = (valor: string) => createHash('sha256').update(valor).digest();

@Injectable()
export class AdminKeyGuard implements CanActivate {
  private readonly logger = new Logger(AdminKeyGuard.name);
  private readonly hashDaChave: Buffer;

  constructor(config: ConfigService<Env, true>) {
    this.hashDaChave = sha256(config.get('ADMIN_API_KEY', { infer: true }));
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<RequestAutenticado>();
    const recebida = req.headers['x-admin-key'];
    if (typeof recebida !== 'string' || recebida.length === 0) throw naoEncontrado();

    if (!timingSafeEqual(sha256(recebida), this.hashDaChave)) {
      this.logger.warn({ evento: 'admin.chave_invalida', ip: req.ip });
      throw naoEncontrado();
    }
    return true;
  }
}
