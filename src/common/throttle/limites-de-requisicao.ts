import { createHash } from 'node:crypto';
import { applyDecorators, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';
import type { Env } from '../../config/env.schema';
import { normalizarEmail } from '../utils/text';

export type NomeLimite = 'login' | 'cadastro' | 'admin' | 'publico';

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

/**
 * O throttler roda antes do JwtAuthGuard, então o tenant ainda não é conhecido: a chave é o
 * hash do token (cada sessão tem sua cota) ou, sem token, o IP.
 */
export function rastreadorPainel(req: { ip?: string; headers?: Record<string, unknown> }): string {
  const auth = req.headers?.authorization;
  if (typeof auth === 'string' && auth.length > 0) {
    return `token:${createHash('sha256').update(auth).digest('hex').slice(0, 32)}`;
  }
  return `ip:${req.ip ?? ''}`;
}

const foraDoPainel = (ctx: ExecutionContext): boolean => {
  const req = ctx.switchToHttp().getRequest<{ originalUrl?: string; url?: string }>();
  return !(req.originalUrl ?? req.url ?? '').startsWith('/v1/painel');
};

export function limitesDeRequisicao(
  env: Pick<Env, 'LOGIN_RATE_LIMIT' | 'LOGIN_RATE_TTL_SECONDS'> &
    Partial<Pick<Env, 'PUBLICO_RATE_LIMIT_POR_MIN' | 'PAINEL_RATE_LIMIT_POR_MIN'>>,
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
    // por IP real (trust proxy); 300 e não 120 por causa do CGNAT das operadoras em 4G
    {
      name: 'publico',
      limit: env.PUBLICO_RATE_LIMIT_POR_MIN ?? 300,
      ttl: 60_000,
      skipIf: naoMarcada('publico'),
    },
    // proteção contra loop no front do painel
    {
      name: 'painel',
      limit: env.PAINEL_RATE_LIMIT_POR_MIN ?? 600,
      ttl: 60_000,
      getTracker: rastreadorPainel,
      skipIf: foraDoPainel,
    },
  ];
}
