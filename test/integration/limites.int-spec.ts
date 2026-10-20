import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { criarCategoria } from '../factories/categoria.factory';
import { criarFilial } from '../factories/filial.factory';
import { umLojista, type LojistaCriado } from '../factories/lojista.factory';
import { enviarPanfleto } from '../factories/panfleto.factory';
import { inserirProduto } from '../factories/produto.factory';
import { criarApp, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, limparBanco, type BancoDeTeste } from '../helpers/banco-de-teste';
import { imagens } from '../helpers/imagens';

describe('Funcionalidade: Limites por lojista ponta a ponta (RNF12)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let lojista: LojistaCriado;
  const auth = () => ({ Authorization: `Bearer ${lojista.token}` });
  const limitar = (colunas: Record<string, number | null>) =>
    banco.sequelize.query(
      `INSERT INTO lojista_limites (lojista_id, max_filiais, max_produtos_por_filial, max_imagem_bytes)
       VALUES (:id, :maxFiliais, :maxProdutos, :maxImagem)`,
      {
        replacements: { id: lojista.id, maxFiliais: null, maxProdutos: null, maxImagem: null, ...colunas },
      },
    );

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
  });
  beforeEach(async () => {
    lojista = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
  });
  afterEach(() => limparBanco(banco));
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  describe('Cenário: sem linha de limites não há limite', () => {
    it('Então 3 filiais são criadas', async () => {
      for (const nome of ['A', 'B', 'C']) await criarFilial(app, lojista.token, { nome });
    });
  });

  describe('Cenário: duas criações concorrentes não ultrapassam o limite', () => {
    it('Então exatamente uma recebe 201 e a outra 409 LIMITE_DO_PLANO_ATINGIDO', async () => {
      await limitar({ maxFiliais: 1 });
      const respostas = await Promise.all(
        ['A', 'B'].map((nome) =>
          app.http().post('/v1/painel/filiais').set(auth()).send({ nome, endereco: 'Rua A, 100' }),
        ),
      );
      expect(respostas.map((r) => r.status).sort()).toEqual([201, 409]);
      const recusada = respostas.find((r) => r.status === 409)!;
      expect(recusada.body.erro).toMatchObject({
        codigo: 'LIMITE_DO_PLANO_ATINGIDO',
        detalhes: { recurso: 'FILIAIS', limite: 1 },
      });
    });
  });

  describe('Cenário: filiais excluídas liberam espaço', () => {
    it('Então depois de excluir a única filial é possível criar outra', async () => {
      await limitar({ maxFiliais: 1 });
      const primeira = await criarFilial(app, lojista.token);
      await app.http().delete(`/v1/painel/filiais/${primeira.id}`).set(auth()).expect(204);
      await criarFilial(app, lojista.token, { nome: 'Nova' });
    });
  });

  describe('Cenário: produtos vencidos não excluídos contam no limite por filial', () => {
    it('Então 409 na filial cheia e 201 em outra filial', async () => {
      await limitar({ maxProdutos: 1 });
      const cheia = await criarFilial(app, lojista.token, { nome: 'Cheia' });
      const livre = await criarFilial(app, lojista.token, { nome: 'Livre' });
      const catCheia = await criarCategoria(app, lojista.token, cheia.id);
      const catLivre = await criarCategoria(app, lojista.token, livre.id);
      await inserirProduto(banco.sequelize, {
        tenantId: lojista.id,
        filialId: cheia.id,
        categoriaId: catCheia.id,
        inicio: '2026-10-01',
        limite: '2026-10-10',
      });
      const corpo = (categoriaId: string) => ({ nome: 'Leite', categoriaId, precoPromocionalCentavos: 499 });
      const r = await app
        .http()
        .post(`/v1/painel/filiais/${cheia.id}/produtos`)
        .set(auth())
        .send(corpo(catCheia.id));
      expect(r.status).toBe(409);
      expect(r.body.erro.detalhes).toEqual({ recurso: 'PRODUTOS_POR_FILIAL', limite: 1 });
      await app
        .http()
        .post(`/v1/painel/filiais/${livre.id}/produtos`)
        .set(auth())
        .send(corpo(catLivre.id))
        .expect(201);
    });
  });

  describe('Cenário: upload acima do limite do lojista', () => {
    it('Então 413 IMAGEM_MUITO_GRANDE e nada é gravado', async () => {
      await limitar({ maxImagem: 1000 });
      const filial = await criarFilial(app, lojista.token);
      const r = await enviarPanfleto(app, lojista.token, filial.id, {}, await imagens.png(400, 400));
      expect(r.status).toBe(413);
      expect(r.body.erro).toMatchObject({ codigo: 'IMAGEM_MUITO_GRANDE', detalhes: { maxBytes: 1000 } });
      const [linhas] = await banco.sequelize.query('SELECT 1 FROM panfletos');
      expect(linhas).toEqual([]);
    });
  });
});
