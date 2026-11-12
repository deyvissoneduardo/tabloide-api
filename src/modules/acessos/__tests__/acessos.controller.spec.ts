import type { INestApplication } from '@nestjs/common';
import { criarAppDeController } from '../../../../test/helpers/app-de-controller';
import { AcessosPanfletosController } from '../controllers/acessos-panfletos.controller';
import { AcessosController } from '../controllers/acessos.controller';
import { AcessosPanfletosService } from '../services/acessos-panfletos.service';
import { ResumoAcessosService } from '../services/resumo-acessos.service';

const FILIAL = '01933b2a-0000-7000-8000-000000000001';

describe('Funcionalidade: rotas do painel de acessos', () => {
  const resumos = { resumo: jest.fn() };
  const panfletos = { listar: jest.fn() };
  let app: INestApplication;
  let http: Awaited<ReturnType<typeof criarAppDeController>>['http'];

  beforeAll(async () => {
    ({ app, http } = await criarAppDeController({
      controllers: [AcessosController, AcessosPanfletosController],
      providers: [
        { provide: ResumoAcessosService, useValue: resumos },
        { provide: AcessosPanfletosService, useValue: panfletos },
      ],
    }));
  });
  beforeEach(() => {
    jest.resetAllMocks();
    resumos.resumo.mockResolvedValue({
      intervalo: { inicio: '2026-11-09', fim: '2026-11-09' },
      total: 0,
      porFilial: [],
      porDia: [{ data: '2026-11-09', total: 0 }],
      iniciosPanfleto: [],
      pico: { disponivel: false, minimo: 100, porHora: null, porDiaSemana: null },
    });
    panfletos.listar.mockResolvedValue([]);
  });
  afterAll(() => app.close());

  describe('Cenário: resumo com query válida', () => {
    it('Então converte periodo para número e repassa o tenant do token', async () => {
      const r = await http().get(`/v1/painel/acessos?periodo=7&filialId=${FILIAL}`);
      expect(r.status).toBe(200);
      expect(resumos.resumo).toHaveBeenCalledWith(
        'T1',
        expect.objectContaining({ periodo: 7, filialId: FILIAL }),
      );
      expect(r.body.pico).toEqual({ disponivel: false, minimo: 100, porHora: null, porDiaSemana: null });
    });
  });

  describe('Esquema do Cenário: formato inválido é VALIDACAO_INVALIDA', () => {
    it.each(['periodo=2', 'periodo=abc', 'inicio=2026-13-01&fim=2026-11-01', 'filialId=xyz', 'tenantId=T2'])(
      'Dado %s, então 400',
      async (q) => {
        const r = await http().get(`/v1/painel/acessos?${q}`);
        expect(r.status).toBe(400);
        expect(r.body.erro.codigo).toBe('VALIDACAO_INVALIDA');
        expect(resumos.resumo).not.toHaveBeenCalled();
      },
    );
  });

  describe('Cenário: acessos por panfleto', () => {
    it('Então responde { itens } e passa o filialId da rota', async () => {
      const r = await http().get(
        `/v1/painel/filiais/${FILIAL}/acessos/panfletos?inicio=2026-11-01&fim=2026-11-09`,
      );
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ itens: [] });
      expect(panfletos.listar).toHaveBeenCalledWith(
        'T1',
        FILIAL,
        expect.objectContaining({ inicio: '2026-11-01', fim: '2026-11-09' }),
      );
    });

    it('E filialId que não é UUID responde 404', async () => {
      const r = await http().get('/v1/painel/filiais/nao-uuid/acessos/panfletos');
      expect(r.status).toBe(404);
      expect(panfletos.listar).not.toHaveBeenCalled();
    });
  });
});
