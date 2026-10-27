import type { INestApplication } from '@nestjs/common';
import { criarAppDeController } from '../../../../test/helpers/app-de-controller';
import { EstruturaController } from '../controllers/estrutura.controller';
import { EstruturaService } from '../services/estrutura.service';

const FILIAL = '0192f3a0-0000-7000-8000-0000000000f1';
const C1 = '0192f3a0-0000-7000-8000-0000000000c1';
const P1 = '0192f3a0-0000-7000-8000-0000000000a1';

describe('Funcionalidade: EstruturaController', () => {
  const estruturas = { obter: jest.fn(), salvar: jest.fn() };
  let app: INestApplication;
  let http: Awaited<ReturnType<typeof criarAppDeController>>['http'];

  beforeAll(async () => {
    ({ app, http } = await criarAppDeController({
      controllers: [EstruturaController],
      providers: [{ provide: EstruturaService, useValue: estruturas }],
    }));
  });
  beforeEach(() => {
    jest.resetAllMocks();
    estruturas.obter.mockResolvedValue({ categorias: [] });
    estruturas.salvar.mockResolvedValue({ categorias: [] });
  });
  afterAll(() => app.close());

  describe('Cenário: GET usa o tenant do token', () => {
    it('Então obter(T1, filialId) e 200 com a estrutura', async () => {
      const resposta = await http().get(`/v1/painel/filiais/${FILIAL}/estrutura`).expect(200);
      expect(resposta.body).toEqual({ categorias: [] });
      expect(estruturas.obter).toHaveBeenCalledWith('T1', FILIAL);
    });
  });

  describe('Cenário: PUT repassa o corpo validado', () => {
    it('Então salvar(T1, filialId, dto) e 200', async () => {
      const corpo = { categorias: [{ id: C1, produtos: [P1] }] };
      await http().put(`/v1/painel/filiais/${FILIAL}/estrutura`).send(corpo).expect(200);
      expect(estruturas.salvar).toHaveBeenCalledWith('T1', FILIAL, corpo);
    });
  });

  describe('Cenário: UUID inválido no caminho', () => {
    it('Então 404 RECURSO_NAO_ENCONTRADO sem chamar o service', async () => {
      const resposta = await http().get('/v1/painel/filiais/abc/estrutura').expect(404);
      expect(resposta.body.erro.codigo).toBe('RECURSO_NAO_ENCONTRADO');
      expect(estruturas.obter).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: corpo inválido', () => {
    it('Então 400 VALIDACAO_INVALIDA com o campo da categoria', async () => {
      const resposta = await http()
        .put(`/v1/painel/filiais/${FILIAL}/estrutura`)
        .send({ categorias: [{ id: 'abc', produtos: [] }] })
        .expect(400);
      expect(resposta.body.erro.codigo).toBe('VALIDACAO_INVALIDA');
      expect(resposta.body.erro.detalhes.campos['categorias.0.id']).toEqual(['id de categoria inválido.']);
      expect(estruturas.salvar).not.toHaveBeenCalled();
    });
  });
});
