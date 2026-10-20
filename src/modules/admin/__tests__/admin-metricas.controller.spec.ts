import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Sequelize } from 'sequelize-typescript';
import { criarAppDeController } from '../../../../test/helpers/app-de-controller';
import { AdminKeyGuard } from '../../../common/guards/admin-key.guard';
import { MetricasService } from '../../../common/observabilidade/metricas.service';
import { AdminMetricasController } from '../controllers/admin-metricas.controller';

const CHAVE = 'k'.repeat(32);

describe('Funcionalidade: Métricas atrás da chave de admin', () => {
  let app: INestApplication;
  let http: Awaited<ReturnType<typeof criarAppDeController>>['http'];
  const metricas = new MetricasService();

  beforeAll(async () => {
    ({ app, http } = await criarAppDeController({
      controllers: [AdminMetricasController],
      providers: [
        AdminKeyGuard,
        { provide: MetricasService, useValue: metricas },
        { provide: ConfigService, useValue: { get: () => CHAVE } },
        { provide: Sequelize, useValue: { connectionManager: { pool: { using: 3, waiting: 1 } } } },
      ],
    }));
  });
  afterAll(() => app.close());

  it('Cenário: sem a chave responde 404', async () =>
    expect((await http().get('/v1/admin/metricas')).status).toBe(404));

  it('Cenário: com a chave devolve texto Prometheus com o pool', async () => {
    const r = await http().get('/v1/admin/metricas').set('X-Admin-Key', CHAVE);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/plain');
    expect(r.text).toContain('db_pool_em_uso 3');
    expect(r.text).toContain('db_pool_espera 1');
  });
});
