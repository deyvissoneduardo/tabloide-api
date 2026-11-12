import { v7 as uuidv7 } from 'uuid';
import { StatusLojista } from '../../../src/modules/lojistas/models/status-lojista';
import { criarAcessos } from '../../factories/acesso-filial.factory';
import { criarFilial, type FilialCriada } from '../../factories/filial.factory';
import { umLojista, type LojistaCriado } from '../../factories/lojista.factory';
import { AGORA_FIXO, criarApp, relogio, type AppDeTeste } from '../../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, limparBanco, type BancoDeTeste } from '../../helpers/banco-de-teste';

/** Relógio: 2026-11-09T15:00Z = 12h de 09/11 em São Paulo. */
const AGORA = new Date('2026-11-09T15:00:00Z');

describe('Funcionalidade: acessos por panfleto (RN55, RN56)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let lojista: LojistaCriado;
  let filial: FilialCriada;

  const sql = (q: string, replacements?: Record<string, unknown>) =>
    banco.sequelize.query(q, { replacements });
  const listar = (query: Record<string, string | number> = {}, filialId = filial.id) =>
    app
      .http()
      .get(`/v1/painel/filiais/${filialId}/acessos/panfletos`)
      .query(query)
      .set('Authorization', `Bearer ${lojista.token}`);
  const panfleto = async (inicio: string, limite: string | null, deletedAt: string | null = null) => {
    const id = uuidv7();
    await sql(
      `INSERT INTO panfletos (id, tenant_id, filial_id, imagem_path, imagem_largura, imagem_altura, data_inicio, data_limite, deleted_at)
       VALUES (:id, :t, :f, 'x.webp', 10, 10, :inicio, :limite, :deletedAt)`,
      { id, t: lojista.id, f: filial.id, inicio, limite, deletedAt },
    );
    return id;
  };
  const semear = (acessos: Array<[string, number]>) =>
    criarAcessos(
      banco.sequelize,
      { tenantId: lojista.id, filialId: filial.id },
      acessos.map(([data, quantidade]) => ({ data, hora: 10, quantidade })),
    );

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
  });
  beforeEach(async () => {
    relogio.agora = AGORA;
    lojista = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    filial = await criarFilial(app, lojista.token, { nome: 'Centro' });
  });
  afterEach(() => limparBanco(banco));
  afterAll(async () => {
    relogio.agora = AGORA_FIXO;
    await app?.fechar();
    await encerrarBanco(banco);
  });

  describe('Cenário: contrato completo', () => {
    it('Então soma a vigência efetiva inteira, mesmo começando antes do filtro', async () => {
      const vencido = await panfleto('2026-10-01', '2026-10-10');
      const atual = await panfleto('2026-10-20', '2026-11-15');
      await panfleto('2026-11-20', null); // agendado: fora
      await semear([
        ['2026-10-05', 30],
        ['2026-10-19', 99], // entre os dois: não entra em nenhum
        ['2026-10-20', 500],
        ['2026-11-09', 480],
      ]);

      const r = await listar({ periodo: 7 }).expect(200);
      expect(r.body).toEqual({
        itens: [
          {
            panfletoId: atual,
            dataInicio: '2026-10-20',
            dataLimite: '2026-11-15',
            dataFimContagem: '2026-11-09',
            situacao: 'VIGENTE',
            totalAcessos: 980,
            dias: 21,
            mediaPorDia: 46.7,
          },
        ],
      });

      const todos = await listar({ inicio: '2026-10-01', fim: '2026-11-09' }).expect(200);
      expect(todos.body.itens.map((i: { panfletoId: string }) => i.panfletoId)).toEqual([atual, vencido]);
      expect(todos.body.itens[1]).toEqual(
        expect.objectContaining({ situacao: 'VENCIDO', totalAcessos: 30, dias: 10, mediaPorDia: 3 }),
      );
    });
  });

  describe('Cenário: panfleto excluído', () => {
    it('Então conta até a data local da exclusão; excluído antes de começar fica fora', async () => {
      // 02:00 UTC de 05/11 = 23:00 de 04/11 em São Paulo
      const excluido = await panfleto('2026-11-01', null, '2026-11-05T02:00:00Z');
      await panfleto('2026-11-08', null, '2026-11-07T12:00:00Z');
      await semear([
        ['2026-11-04', 8],
        ['2026-11-05', 100],
      ]);
      const r = await listar({ periodo: 15 }).expect(200);
      expect(r.body.itens).toEqual([
        expect.objectContaining({
          panfletoId: excluido,
          situacao: 'EXCLUIDO',
          dataFimContagem: '2026-11-04',
          totalAcessos: 8,
          dias: 4,
          mediaPorDia: 2,
        }),
      ]);
    });
  });

  describe('Cenário: filial excluída ou inexistente', () => {
    it('Então 404', async () => {
      await listar({}, uuidv7()).expect(404);
      await sql(`UPDATE filiais SET deleted_at = now() WHERE id = :id`, { id: filial.id });
      const r = await listar().expect(404);
      expect(r.body.erro.codigo).toBe('RECURSO_NAO_ENCONTRADO');
    });
  });

  describe('Esquema do Cenário: PERIODO_INVALIDO com o hoje da filial', () => {
    it.each([
      [{ periodo: 7, fim: '2026-11-09' }, 'COMBINACAO'],
      [{ inicio: '2026-11-05', fim: '2026-11-04' }, 'FIM_ANTES_DO_INICIO'],
      [{ inicio: '2026-11-01', fim: '2026-11-10' }, 'FIM_NO_FUTURO'],
      [{ inicio: '2025-01-01', fim: '2026-11-09' }, 'ACIMA_DE_366_DIAS'],
    ])('Dado %j, então %s', async (query, motivo) => {
      const r = await listar(query).expect(400);
      expect(r.body.erro).toEqual(
        expect.objectContaining({ codigo: 'PERIODO_INVALIDO', detalhes: { motivo } }),
      );
    });
  });
});
