import type { INestApplication } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { criarAppDeController } from '../../../../test/helpers/app-de-controller';
import { AuditoriaController } from '../controllers/auditoria.controller';
import { AuditoriaService } from '../services/auditoria.service';

describe('Funcionalidade: Consulta de auditoria', () => {
  const auditoria = { listar: jest.fn() };
  let app: INestApplication;
  let http: Awaited<ReturnType<typeof criarAppDeController>>['http'];
  const entidadeId = uuidv7();

  beforeAll(async () => {
    ({ app, http } = await criarAppDeController({
      controllers: [AuditoriaController],
      providers: [{ provide: AuditoriaService, useValue: auditoria }],
    }));
  });
  beforeEach(() => auditoria.listar.mockReset());
  afterAll(() => app.close());

  describe('Cenário: repassa o tenant do token e devolve a view paginada', () => {
    it('Então o service recebe o filtro com a paginação padrão e a resposta não tem tenantId', async () => {
      auditoria.listar.mockResolvedValue({
        itens: [
          {
            id: 'a1',
            tenantId: 'T1',
            entidade: 'PRODUTO',
            entidadeId,
            campo: 'precoPromocionalCentavos',
            valorAnterior: '899',
            valorNovo: '799',
            alteradoEm: new Date('2026-10-18T15:04:05Z'),
            requestId: 'r1',
          },
        ],
        total: 1,
      });
      const resposta = await http().get(`/v1/painel/auditoria?entidade=PRODUTO&entidadeId=${entidadeId}`);

      expect(resposta.status).toBe(200);
      expect(auditoria.listar).toHaveBeenCalledWith(
        'T1',
        expect.objectContaining({ entidade: 'PRODUTO', entidadeId, pagina: 1, porPagina: 50 }),
      );
      expect(resposta.body).toEqual({
        itens: [
          {
            id: 'a1',
            entidade: 'PRODUTO',
            entidadeId,
            campo: 'precoPromocionalCentavos',
            valorAnterior: '899',
            valorNovo: '799',
            alteradoEm: '2026-10-18T15:04:05.000Z',
            requestId: 'r1',
          },
        ],
        total: 1,
        pagina: 1,
        porPagina: 50,
      });
    });
  });

  describe.each([
    ['entidade inválida', `entidade=CATEGORIA&entidadeId=${uuidv7()}`],
    ['entidadeId que não é UUID', 'entidade=PRODUTO&entidadeId=abc'],
    ['sem entidade', `entidadeId=${uuidv7()}`],
    ['porPagina acima de 100', `entidade=PRODUTO&entidadeId=${uuidv7()}&porPagina=101`],
    ['pagina zero', `entidade=PRODUTO&entidadeId=${uuidv7()}&pagina=0`],
    ['tenantId na query', `entidade=PRODUTO&entidadeId=${uuidv7()}&tenantId=T2`],
  ])('Cenário: %s', (_nome, query) => {
    it('Então 400 VALIDACAO_INVALIDA e o service não é chamado', async () => {
      const resposta = await http().get(`/v1/painel/auditoria?${query}`);
      expect(resposta.status).toBe(400);
      expect(resposta.body.erro.codigo).toBe('VALIDACAO_INVALIDA');
      expect(auditoria.listar).not.toHaveBeenCalled();
    });
  });
});
