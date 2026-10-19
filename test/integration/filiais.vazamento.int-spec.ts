import { v7 as uuidv7 } from 'uuid';
import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { criarFilial } from '../factories/filial.factory';
import { umLojista } from '../factories/lojista.factory';
import { criarApp, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, type BancoDeTeste } from '../helpers/banco-de-teste';
import { descreverVazamentoEntreTenants } from '../helpers/vazamento';

describe('Funcionalidade: Isolamento de filiais entre lojistas (RNF04)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let tokenA: string;
  let tokenB: string;
  let idB: string;

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
    const a = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    const b = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    [tokenA, tokenB, idB] = [a.token, b.token, b.id];
  });
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  const comToken = (token: string) => ({ Authorization: `Bearer ${token}` });

  descreverVazamentoEntreTenants(() => ({ app, tokenA: tokenB, tokenB: tokenA }), {
    nome: 'filiais',
    criarComo: (token) => criarFilial(app, token),
    lerComo: async (token, id) =>
      (await app.http().get(`/v1/painel/filiais/${id}`).set(comToken(token))).body,
    rotas: [
      { metodo: 'get', caminho: (id) => `/v1/painel/filiais/${id}` },
      { metodo: 'patch', caminho: (id) => `/v1/painel/filiais/${id}`, corpo: { nome: 'Invadida' } },
      { metodo: 'delete', caminho: (id) => `/v1/painel/filiais/${id}` },
      { metodo: 'get', caminho: (id) => `/v1/painel/filiais/${id}/qrcode` },
    ],
  });

  describe('Cenário: listagem não mostra filiais de outro lojista', () => {
    it('Então nenhum item é de B e o total conta só as de A', async () => {
      const deB = await criarFilial(app, tokenB);
      const lista = await app.http().get('/v1/painel/filiais').set(comToken(tokenA)).expect(200);
      expect(lista.body.itens.map((f: { id: string }) => f.id)).not.toContain(deB.id);
      const [[contagem]] = (await banco.sequelize.query(
        `SELECT count(*)::int AS total FROM filiais f JOIN lojistas l ON l.id = f.tenant_id
         WHERE f.deleted_at IS NULL AND l.id <> :b`,
        { replacements: { b: idB } },
      )) as [{ total: number }[], unknown];
      expect(lista.body.total).toBe(contagem!.total);
    });
  });

  describe('Cenário: tenantId no corpo é recusado', () => {
    it('Então 400 e nenhuma filial é criada para B', async () => {
      const antes = await banco.sequelize.query('SELECT count(*) FROM filiais WHERE tenant_id = :b', {
        replacements: { b: idB },
      });
      const resposta = await app
        .http()
        .post('/v1/painel/filiais')
        .set(comToken(tokenA))
        .send({ nome: 'X', endereco: 'Y', tenantId: idB });
      expect(resposta.status).toBe(400);
      const depois = await banco.sequelize.query('SELECT count(*) FROM filiais WHERE tenant_id = :b', {
        replacements: { b: idB },
      });
      expect(depois).toEqual(antes);
    });
  });

  describe('Cenário: 404 é idêntico para inexistente e alheio', () => {
    it('Então status e corpo são iguais', async () => {
      const deB = await criarFilial(app, tokenB);
      const alheia = await app.http().get(`/v1/painel/filiais/${deB.id}`).set(comToken(tokenA));
      const inexistente = await app.http().get(`/v1/painel/filiais/${uuidv7()}`).set(comToken(tokenA));
      expect({ status: alheia.status, body: alheia.body }).toEqual({
        status: inexistente.status,
        body: inexistente.body,
      });
    });
  });
});
