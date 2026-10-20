import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import type { DynamicModule, INestApplication, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configurarApp } from '../../src/app.setup';
import { ClockService } from '../../src/common/clock/clock.service';
import { destinoDeLogs } from '../../src/config/logger.config';

export const AGORA_FIXO = new Date('2026-10-18T12:00:00Z');

/** Relógio dos apps de teste: começa em AGORA_FIXO e pode ser avançado pelo teste. */
export const relogio = { agora: AGORA_FIXO };
export const ADMIN_KEY = 'chave-admin-de-teste-com-mais-de-32-caracteres';
export const PUBLIC_BASE_URL = 'https://tabloide.app';

export interface AppDeTeste {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  logs: string[];
  /** Raiz do DiskStorageAdapter deste app (diretório temporário). */
  midiaDir: string;
  fechar: () => Promise<void>;
}

/** Sobe o AppModule real contra o banco do container, com relógio fixo e logs capturados. */
export async function criarApp(
  databaseUrl: string,
  env: Record<string, string> = {},
  modulosExtras: Array<Type | DynamicModule> = [],
): Promise<AppDeTeste> {
  const midiaDir = mkdtempSync(path.join(os.tmpdir(), 'tabloide-midia-'));
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'info',
    DATABASE_URL: databaseUrl,
    JWT_SECRET: 'segredo-jwt-de-teste-com-mais-de-32-caracteres',
    JWT_EXPIRES_IN: '8h',
    ADMIN_API_KEY: ADMIN_KEY,
    LOGIN_RATE_LIMIT: '5',
    LOGIN_RATE_TTL_SECONDS: '900',
    TENANT_STATUS_CACHE_TTL_MS: '0',
    PUBLIC_BASE_URL: 'https://tabloide.app',
    FUSO_HORARIO_PADRAO: 'America/Sao_Paulo',
    STORAGE_DRIVER: 'disco',
    MIDIA_DIR_LOCAL: midiaDir,
    MIDIA_URL_BASE_LOCAL: 'http://localhost/v1/midia-local',
    ...env,
  });

  const logs: string[] = [];
  destinoDeLogs.stream = new Writable({
    write(pedaco, _enc, feito) {
      logs.push(String(pedaco));
      feito();
    },
  });

  // importado só agora: o ConfigModule valida o env no momento do import do AppModule.
  // O Jest isola módulos por arquivo, então cada arquivo de teste usa o env da primeira chamada.
  const { AppModule } = await import('../../src/app.module');
  const modulo = await Test.createTestingModule({ imports: [AppModule, ...modulosExtras] })
    .overrideProvider(ClockService)
    .useValue({ agora: () => relogio.agora })
    .compile();
  const app = configurarApp(modulo.createNestApplication<NestExpressApplication>({ bufferLogs: true }));
  await app.init();

  return {
    app,
    http: () => request(app.getHttpServer()),
    logs,
    midiaDir,
    fechar: async () => {
      await app.close();
      destinoDeLogs.stream = undefined;
    },
  };
}

let ultimoIp = 0;

/** IP distinto por chamada (via X-Forwarded-For), para o rate limit de um teste não afetar outro. */
export function ipNovo(): string {
  ultimoIp += 1;
  return `10.0.${Math.floor(ultimoIp / 250)}.${(ultimoIp % 250) + 1}`;
}
