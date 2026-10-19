import type { INestApplication, ModuleMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppExceptionFilter } from '../../src/common/errors/app-exception.filter';
import { criarValidationPipe } from '../../src/common/pipes/validation.pipe';

/**
 * App HTTP mínima para testar controllers: pipe e filtro globais reais,
 * services mockados e o tenant do "token" injetado direto em req.user.
 */
export async function criarAppDeController(metadata: ModuleMetadata, tenantId = 'T1') {
  const modulo = await Test.createTestingModule(metadata).compile();
  const app: INestApplication = modulo.createNestApplication({ logger: false });
  app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { tenantId };
    next();
  });
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(criarValidationPipe());
  app.useGlobalFilters(new AppExceptionFilter());
  await app.init();
  return { app, http: () => request(app.getHttpServer()) };
}
