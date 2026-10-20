import type { INestApplication } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { criarAppDeController } from '../../../../test/helpers/app-de-controller';
import { DesligamentoService } from '../../../common/observabilidade/desligamento.service';
import { SaudeController } from '../controllers/saude.controller';

describe('Funcionalidade: Health check', () => {
  const sequelize = { query: jest.fn() };
  const desligamento = { emDesligamento: false };
  let app: INestApplication;
  let http: Awaited<ReturnType<typeof criarAppDeController>>['http'];

  beforeAll(async () => {
    ({ app, http } = await criarAppDeController({
      controllers: [SaudeController],
      providers: [
        { provide: Sequelize, useValue: sequelize },
        { provide: DesligamentoService, useValue: desligamento },
      ],
    }));
  });
  beforeEach(() => {
    jest.resetAllMocks();
    desligamento.emDesligamento = false;
    sequelize.query.mockResolvedValue([]);
  });
  afterAll(() => app.close());

  describe('Cenário: liveness não depende do banco', () => {
    it('Então 200 { status: "ok" } mesmo com o banco fora do ar', async () => {
      sequelize.query.mockRejectedValue(new Error('fora'));
      const r = await http().get('/v1/saude/vivo');
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ status: 'ok' });
    });
  });

  describe('Cenário: readiness com banco disponível', () => {
    it('Então 200 e banco up', async () => {
      const r = await http().get('/v1/saude/pronto');
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ status: 'ok', info: { banco: { status: 'up' } } });
    });
  });

  describe('Cenário: readiness com banco indisponível ou lento', () => {
    it('Então 503 quando o ping falha', async () => {
      sequelize.query.mockRejectedValue(new Error('fora'));
      expect((await http().get('/v1/saude/pronto')).status).toBe(503);
    });

    it('E 503 quando o ping passa de 1 s', async () => {
      sequelize.query.mockImplementation(() => new Promise((r) => setTimeout(r, 1500)));
      const r = await http().get('/v1/saude/pronto');
      expect(r.status).toBe(503);
      expect(r.body.info.banco.status).toBe('down');
    });
  });

  describe('Cenário: readiness durante o desligamento', () => {
    it('Então 503 sem nem consultar o banco', async () => {
      desligamento.emDesligamento = true;
      expect((await http().get('/v1/saude/pronto')).status).toBe(503);
      expect(sequelize.query).not.toHaveBeenCalled();
    });
  });
});
