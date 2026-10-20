import type { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { v7 as uuidv7 } from 'uuid';
import type { Env } from './env.schema';

const REQUEST_ID_VALIDO = /^[A-Za-z0-9-]{1,64}$/;

export const CAMPOS_OMITIDOS_NO_LOG = [
  'req.headers.authorization',
  'req.headers["x-admin-key"]',
  'req.body.senha',
  'req.body.novaSenha',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

/** Fração das respostas 2xx/3xx da página pública que viram log de acesso. */
export const AMOSTRA_LOG_PUBLICO = 0.01;

interface ReqLog {
  url?: string;
  originalUrl?: string;
}

const caminho = (req: ReqLog) => req.originalUrl ?? req.url ?? '';

/**
 * Saúde não gera log de acesso. Na página pública só erros e uma amostra das respostas boas,
 * para o volume do QR Code não afogar os logs.
 */
export function nivelDoLogDeAcesso(sortear: () => number = Math.random) {
  return (req: ReqLog, res: { statusCode: number }, err?: unknown): string => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return caminho(req).startsWith('/v1/publico/') ? 'info' : 'warn';
    if (caminho(req).startsWith('/v1/publico/') && sortear() >= AMOSTRA_LOG_PUBLICO) return 'silent';
    return 'info';
  };
}

export const destinoDeLogs: { stream?: DestinationStream } = {};

export function opcoesDoLogger(config: ConfigService<Env, true>): Params {
  const opcoes = {
    level: config.get('LOG_LEVEL', { infer: true }),
    genReqId: (req: { headers: Record<string, unknown> }, res: { setHeader(n: string, v: string): void }) => {
      const recebido = req.headers['x-request-id'];
      const id = typeof recebido === 'string' && REQUEST_ID_VALIDO.test(recebido) ? recebido : uuidv7();
      res.setHeader('x-request-id', id);
      return id;
    },
    redact: { paths: CAMPOS_OMITIDOS_NO_LOG, censor: '[omitido]' },
    autoLogging: { ignore: (req: ReqLog) => caminho(req).startsWith('/v1/saude') },
    customLogLevel: nivelDoLogDeAcesso(),
    transport:
      config.get('NODE_ENV', { infer: true }) === 'development' && !destinoDeLogs.stream
        ? { target: 'pino-pretty' }
        : undefined,
  };
  return { pinoHttp: destinoDeLogs.stream ? [opcoes, destinoDeLogs.stream] : opcoes } as Params;
}
