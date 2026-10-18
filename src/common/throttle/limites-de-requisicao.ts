import { applyDecorators, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';
import type { Env } from '../../config/env.schema';
import { normalizarEmail } from '../utils/text';

export type NomeLimite = 'login' | 'cadastro' | 'admin';

const chaveMetadata = (nome: NomeLimite) => `limite:${nome}`;

export const LimitarRequisicoes = (nome: NomeLimite) =>
  applyDecorators(SetMetadata(chaveMetadata(nome), true));

function naoMarcada(nome: NomeLimite) {
  return (ctx: ExecutionContext): boolean =>
    Reflect.getMetadata(chaveMetadata(nome), ctx.getHandler()) !== true &&
    Reflect.getMetadata(chaveMetadata(nome), ctx.getClass()) !== true;
}

export function rastreadorLogin(req: { ip?: string; body?: { email?: unknown } }): string {
  const email = typeof req.body?.email === 'string' ? normalizarEmail(req.body.email) : '';
  return `${req.ip ?? ''}:${email}`;
}

export function limitesDeRequisicao(
  env: Pick<Env, 'LOGIN_RATE_LIMIT' | 'LOGIN_RATE_TTL_SECONDS'>,
): ThrottlerOptions[] {
  return [
    {
      name: 'login',
      limit: env.LOGIN_RATE_LIMIT,
      ttl: env.LOGIN_RATE_TTL_SECONDS * 1000,
      getTracker: rastreadorLogin,
      skipIf: naoMarcada('login'),
    },
    { name: 'cadastro', limit: 10, ttl: 3_600_000, skipIf: naoMarcada('cadastro') },
    { name: 'admin', limit: 10, ttl: 60_000, skipIf: naoMarcada('admin') },
  ];
}
