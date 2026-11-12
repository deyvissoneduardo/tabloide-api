import { v7 as uuidv7 } from 'uuid';
import { StatusLojista } from '../../../src/modules/lojistas/models/status-lojista';
import { criarAcessos } from '../../factories/acesso-filial.factory';
import { criarFilial, type FilialCriada } from '../../factories/filial.factory';
import { definirStatus, umLojista, type LojistaCriado } from '../../factories/lojista.factory';
import { AGORA_FIXO, criarApp, relogio, type AppDeTeste } from '../../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, limparBanco, type BancoDeTeste } from '../../helpers/banco-de-teste';

/** Relógio: 2026-11-09T15:00Z = 12h de 09/11 em São Paulo e 11h em Manaus. */
const AGORA = new Date('2026-11-09T15:00:00Z');

describe('Funcionalidade: resumo de acessos do lojista (RN53, RN54, RN57)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let lojista: LojistaCriado;
  let centro: FilialCriada;
  let manaus: FilialCriada;

  const sql = (q: string, replacements?: Record<string, unknown>) =>
    banco.sequelize.query(q, { replacements });
  const resumo = (query: Record<string, string | number> = {}, token = lojista.token) =>
    app.http().get('/v1/painel/acessos').query(query).set('Authorization', `Bearer ${token}`);
  const semear = (filialId: string, acessos: Array<[string, number, number]>) =>
    criarAcessos(
      banco.sequelize,
      { tenantId: lojista.id, filialId },
      acessos.map(([data, hora, quantidade]) => ({ data, hora, quantidade })),
    );
  const excluirFilial = (id: string) =>
    sql(`UPDATE filiais SET deleted_at = '2026-11-06T12:00:00Z' WHERE id = :id`, { id });
  const inserirPanfleto = (filialId: string, inicio: string, deletedAt: string | null = null) =>
    sql(
      `INSERT INTO panfletos (id, tenant_id, filial_id, imagem_path, imagem_largura, imagem_altura, data_inicio, deleted_at)
       VALUES (:id, :t, :f, 'x.webp', 10, 10, :inicio, :deletedAt)`,
      { id: uuidv7(), t: lojista.id, f: filialId, inicio, deletedAt },
    );

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
  });
  beforeEach(async () => {
    relogio.agora = AGORA;
    lojista = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    centro = await criarFilial(app, lojista.token, { nome: 'Centro' });
    manaus = await criarFilial(app, lojista.token, { nome: 'Manaus', fusoHorario: 'America/Manaus' });
  });
  afterEach(() => limparBanco(banco));
  afterAll(async () => {
    relogio.agora = AGORA_FIXO;
    await app?.fechar();
    await encerrarBanco(banco);
  });

  describe('Cenário: contrato completo dos últimos 7 dias', () => {
    it('Então total, ranking, por dia contínuo, inícios de panfleto e pico indisponível', async () => {
      const antiga = await criarFilial(app, lojista.token, { nome: 'Loja antiga' });
      const vazia = await criarFilial(app, lojista.token, { nome: 'Fechada sem acesso' });
      await semear(centro.id, [
        ['2026-11-02', 9, 50], // fora do período
        ['2026-11-03', 9, 5],
        ['2026-11-09', 20, 10],
      ]);
      await semear(manaus.id, [['2026-11-08', 10, 3]]);
      await semear(antiga.id, [['2026-11-05', 8, 2]]);
      await excluirFilial(antiga.id);
      await excluirFilial(vazia.id);
      await inserirPanfleto(centro.id, '2026-11-05');
      await inserirPanfleto(centro.id, '2026-11-07', '2026-11-06T12:00:00Z'); // excluído antes de começar
      await inserirPanfleto(manaus.id, '2026-10-01'); // fora do intervalo

      const r = await resumo({ periodo: 7 }).expect(200);

      expect(r.body.intervalo).toEqual({ inicio: '2026-11-03', fim: '2026-11-09' });
      expect(r.body.total).toBe(20);
      expect(r.body.porFilial).toEqual([
        { filialId: centro.id, nome: 'Centro', excluida: false, total: 15 },
        { filialId: manaus.id, nome: 'Manaus', excluida: false, total: 3 },
        { filialId: antiga.id, nome: 'Loja antiga', excluida: true, total: 2 },
      ]);
      expect(r.body.porDia).toEqual([
        { data: '2026-11-03', total: 5 },
        { data: '2026-11-04', total: 0 },
        { data: '2026-11-05', total: 2 },
        { data: '2026-11-06', total: 0 },
        { data: '2026-11-07', total: 0 },
        { data: '2026-11-08', total: 3 },
        { data: '2026-11-09', total: 10 },
      ]);
      expect(r.body.iniciosPanfleto).toEqual([{ data: '2026-11-05', filialId: centro.id }]);
      expect(r.body.pico).toEqual({ disponivel: false, minimo: 100, porHora: null, porDiaSemana: null });
      expect(JSON.stringify(r.body)).not.toMatch(/tenantId|deletedAt/);
    });
  });

  describe('Cenário: horário de pico com 100 acessos ou mais', () => {
    it('Então 24 horas locais e 7 dias de segunda a domingo', async () => {
      // 2026-11-09 é segunda; 2026-11-08 é domingo
      await semear(centro.id, [
        ['2026-11-09', 9, 60],
        ['2026-11-08', 18, 30],
      ]);
      await semear(manaus.id, [['2026-11-09', 9, 10]]);
      const r = await resumo({ periodo: 7 }).expect(200);
      expect(r.body.total).toBe(100);
      expect(r.body.pico.disponivel).toBe(true);
      expect(r.body.pico.porHora).toHaveLength(24);
      expect(r.body.pico.porHora[9]).toBe(70);
      expect(r.body.pico.porHora[18]).toBe(30);
      expect(r.body.pico.porDiaSemana).toEqual([70, 0, 0, 0, 0, 0, 30]);
    });
  });

  describe('Cenário: filtro por filial', () => {
    it('Então total, por dia e pico só da filial, e o ranking com todas', async () => {
      await semear(centro.id, [['2026-11-09', 9, 7]]);
      await semear(manaus.id, [['2026-11-09', 9, 4]]);
      const r = await resumo({ periodo: 1, filialId: manaus.id }).expect(200);
      expect(r.body.total).toBe(4);
      expect(r.body.porDia).toEqual([{ data: '2026-11-09', total: 4 }]);
      expect(r.body.porFilial.map((f: { total: number }) => f.total)).toEqual([7, 4]);
    });

    it('E aceita a filial excluída do próprio lojista (RN57)', async () => {
      await semear(manaus.id, [['2026-11-04', 9, 4]]);
      await excluirFilial(manaus.id);
      const r = await resumo({ periodo: 7, filialId: manaus.id }).expect(200);
      expect(r.body.total).toBe(4);
      expect(r.body.porFilial).toContainEqual({
        filialId: manaus.id,
        nome: 'Manaus',
        excluida: true,
        total: 4,
      });
    });

    it('E responde 404 para filial inexistente', async () => {
      const r = await resumo({ filialId: uuidv7() }).expect(404);
      expect(r.body.erro.codigo).toBe('RECURSO_NAO_ENCONTRADO');
    });
  });

  describe('Cenário: período personalizado', () => {
    it('Então o intervalo é o mesmo para todas as filiais', async () => {
      await semear(centro.id, [['2026-10-15', 9, 5]]);
      await semear(manaus.id, [['2026-11-01', 9, 1]]);
      const r = await resumo({ inicio: '2026-10-01', fim: '2026-10-31' }).expect(200);
      expect(r.body.intervalo).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' });
      expect(r.body.porDia).toHaveLength(31);
      expect(r.body.total).toBe(5);
    });
  });

  describe('Esquema do Cenário: PERIODO_INVALIDO', () => {
    it.each([
      [{ periodo: 7, inicio: '2026-11-01', fim: '2026-11-02' }, 'COMBINACAO'],
      [{ inicio: '2026-11-01' }, 'COMBINACAO'],
      [{ inicio: '2026-11-05', fim: '2026-11-04' }, 'FIM_ANTES_DO_INICIO'],
      [{ inicio: '2026-11-01', fim: '2026-11-10' }, 'FIM_NO_FUTURO'],
      [{ inicio: '2025-11-08', fim: '2026-11-09' }, 'ACIMA_DE_366_DIAS'],
    ])('Dado %j, então 400 com motivo %s', async (query, motivo) => {
      const r = await resumo(query).expect(400);
      expect(r.body.erro.codigo).toBe('PERIODO_INVALIDO');
      expect(r.body.erro.detalhes).toEqual({ motivo });
    });

    it('E formato inválido continua VALIDACAO_INVALIDA', async () => {
      const r = await resumo({ periodo: 2 }).expect(400);
      expect(r.body.erro.codigo).toBe('VALIDACAO_INVALIDA');
    });
  });

  describe('Cenário: lojista desativado consulta (somente leitura)', () => {
    it('Então o GET responde 200', async () => {
      await definirStatus(banco.sequelize, lojista.id, StatusLojista.DESATIVADO);
      await resumo({ periodo: 1 }).expect(200);
    });
  });

  describe('Cenário: sem token', () => {
    it('Então 401', () => app.http().get('/v1/painel/acessos').expect(401));
  });
});
