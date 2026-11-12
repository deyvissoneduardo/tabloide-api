import { StatusLojista } from '../../../src/modules/lojistas/models/status-lojista';
import { criarAcessos } from '../../factories/acesso-filial.factory';
import { criarFilial } from '../../factories/filial.factory';
import { umLojista, type LojistaCriado } from '../../factories/lojista.factory';
import { AGORA_FIXO, criarApp, relogio, type AppDeTeste } from '../../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, type BancoDeTeste } from '../../helpers/banco-de-teste';
import { descreverVazamentoEntreTenants } from '../../helpers/vazamento';

/** Relógio padrão: hoje = 2026-10-18 em São Paulo. */
describe('Funcionalidade: isolamento dos acessos entre lojistas (RNF04)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let a: LojistaCriado;
  let b: LojistaCriado;

  beforeAll(async () => {
    relogio.agora = AGORA_FIXO;
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
    a = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    b = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
  });
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  const resumo = (token: string, filialId?: string) =>
    app
      .http()
      .get('/v1/painel/acessos')
      .query({ periodo: 1, ...(filialId ? { filialId } : {}) })
      .set('Authorization', `Bearer ${token}`);

  descreverVazamentoEntreTenants(() => ({ app, tokenA: a.token, tokenB: b.token }), {
    nome: 'acessos da filial',
    criarComo: async (token) => {
      const filial = await criarFilial(app, token, { nome: 'Filial de A' });
      await criarAcessos(banco.sequelize, { tenantId: a.id, filialId: filial.id }, [
        { data: '2026-10-18', hora: 9, quantidade: 7 },
      ]);
      return { id: filial.id };
    },
    rotas: [
      { metodo: 'get', caminho: (id) => `/v1/painel/acessos?filialId=${id}` },
      { metodo: 'get', caminho: (id) => `/v1/painel/filiais/${id}/acessos/panfletos` },
    ],
    lerComo: async (token, id) => (await resumo(token, id)).body,
  });

  describe('Cenário: A e B com acessos no mesmo dia e hora', () => {
    it('Então o resumo de B não soma nem lista nada de A', async () => {
      const filialA = await criarFilial(app, a.token, { nome: 'Só de A' });
      const filialB = await criarFilial(app, b.token, { nome: 'Só de B' });
      await criarAcessos(banco.sequelize, { tenantId: a.id, filialId: filialA.id }, [
        { data: '2026-10-18', hora: 9, quantidade: 50 },
      ]);
      await criarAcessos(banco.sequelize, { tenantId: b.id, filialId: filialB.id }, [
        { data: '2026-10-18', hora: 9, quantidade: 3 },
      ]);
      const r = await resumo(b.token).expect(200);
      expect(r.body.total).toBe(3);
      expect(r.body.porFilial).toEqual([
        { filialId: filialB.id, nome: 'Só de B', excluida: false, total: 3 },
      ]);
    });
  });
});
