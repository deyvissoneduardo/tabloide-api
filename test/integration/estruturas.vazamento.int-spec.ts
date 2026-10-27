import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { criarCategoria } from '../factories/categoria.factory';
import { criarFilial } from '../factories/filial.factory';
import { umLojista } from '../factories/lojista.factory';
import { criarProduto } from '../factories/produto.factory';
import { criarApp, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, type BancoDeTeste } from '../helpers/banco-de-teste';
import { descreverVazamentoEntreTenants } from '../helpers/vazamento';

describe('Funcionalidade: Isolamento da estrutura da filial entre lojistas (RNF04, RN45)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
    tokenA = (await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize)).token;
    tokenB = (await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize)).token;
  });
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  const lerEstrutura = async (token: string, filialId: string) =>
    (
      await app
        .http()
        .get(`/v1/painel/filiais/${filialId}/estrutura`)
        .set({ Authorization: `Bearer ${token}` })
    ).body;

  descreverVazamentoEntreTenants(() => ({ app, tokenA, tokenB }), {
    nome: 'estrutura da filial',
    criarComo: async (token) => {
      const filial = await criarFilial(app, token);
      const categoria = await criarCategoria(app, token, filial.id, 'Bebidas');
      await criarProduto(app, token, filial.id, categoria.id);
      return { id: filial.id };
    },
    rotas: [
      { metodo: 'get', caminho: (id) => `/v1/painel/filiais/${id}/estrutura` },
      { metodo: 'put', caminho: (id) => `/v1/painel/filiais/${id}/estrutura`, corpo: { categorias: [] } },
    ],
    lerComo: lerEstrutura,
  });

  describe('Cenário: B envia no PUT da própria filial a categoria de A', () => {
    it('Então 422 CATEGORIA_DESCONHECIDA e a ordem de A não muda', async () => {
      const filialA = await criarFilial(app, tokenA);
      const zebra = await criarCategoria(app, tokenA, filialA.id, 'Zebra');
      const abacate = await criarCategoria(app, tokenA, filialA.id, 'Abacate');
      await criarProduto(app, tokenA, filialA.id, zebra.id);
      await app
        .http()
        .put(`/v1/painel/filiais/${filialA.id}/estrutura`)
        .set({ Authorization: `Bearer ${tokenA}` })
        .send({ categorias: [{ id: zebra.id, produtos: [] }] })
        .expect(200);
      const antes = await lerEstrutura(tokenA, filialA.id);

      const filialB = await criarFilial(app, tokenB);
      const resposta = await app
        .http()
        .put(`/v1/painel/filiais/${filialB.id}/estrutura`)
        .set({ Authorization: `Bearer ${tokenB}` })
        .send({ categorias: [{ id: abacate.id, produtos: [] }] })
        .expect(422);
      expect(resposta.body.erro.detalhes.problemas).toEqual([
        { tipo: 'CATEGORIA_DESCONHECIDA', id: abacate.id },
      ]);
      expect(await lerEstrutura(tokenA, filialA.id)).toEqual(antes);
      expect(antes.categorias.map((c: { nome: string }) => c.nome)).toEqual(['Zebra', 'Abacate']);
    });
  });
});
