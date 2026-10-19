import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { criarCategoria } from '../factories/categoria.factory';
import { criarFilial } from '../factories/filial.factory';
import { umLojista } from '../factories/lojista.factory';
import { criarProduto } from '../factories/produto.factory';
import { criarApp, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, type BancoDeTeste } from '../helpers/banco-de-teste';
import { imagens } from '../helpers/imagens';

describe('Funcionalidade: Isolamento de categorias e produtos entre lojistas (RNF04)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let tokenA: string;
  let tokenB: string;
  let filialA: string;
  let filialB: string;
  let categoriaA: string;
  let categoriaB: string;
  let produtoA: string;
  let produtoB: string;

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
    const a = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    const b = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    [tokenA, tokenB] = [a.token, b.token];
    filialA = (await criarFilial(app, tokenA)).id;
    filialB = (await criarFilial(app, tokenB)).id;
    categoriaA = (await criarCategoria(app, tokenA, filialA, 'Bebidas')).id;
    categoriaB = (await criarCategoria(app, tokenB, filialB, 'Bebidas')).id;
    produtoA = (await criarProduto(app, tokenA, filialA, categoriaA)).id;
    produtoB = (await criarProduto(app, tokenB, filialB, categoriaB, { nome: 'Exclusivo B' })).id;
  });
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  const comoA = () => ({ Authorization: `Bearer ${tokenA}` });
  const comoB = () => ({ Authorization: `Bearer ${tokenB}` });
  /** Estado de B visto pelo próprio B: categorias com contagens e o produto. */
  const dadosDeB = async () => {
    const categorias = await app.http().get(`/v1/painel/filiais/${filialB}/categorias`).set(comoB());
    const produto = await app.http().get(`/v1/painel/filiais/${filialB}/produtos/${produtoB}`).set(comoB());
    return { categorias: categorias.body, produto: produto.body };
  };
  const foto = async () =>
    ({
      arquivo: await imagens.jpeg(10, 10),
      opcoes: { filename: 'a.jpg', contentType: 'image/jpeg' },
    }) as const;

  describe('Esquema do Cenário: A acessa recurso do outro lojista', () => {
    const cat = () => `/v1/painel/filiais/${filialB}/categorias`;
    const prod = () => `/v1/painel/filiais/${filialB}/produtos`;
    it.each([
      ['GET categorias', () => app.http().get(cat()).set(comoA())],
      ['POST categoria', () => app.http().post(cat()).set(comoA()).send({ nome: 'Invasora' })],
      ['PATCH categoria', () => app.http().patch(`${cat()}/${categoriaB}`).set(comoA()).send({ nome: 'X' })],
      ['DELETE categoria', () => app.http().delete(`${cat()}/${categoriaB}`).set(comoA())],
      ['GET produtos', () => app.http().get(prod()).set(comoA())],
      [
        'POST produto',
        () =>
          app
            .http()
            .post(prod())
            .set(comoA())
            .send({ nome: 'X', categoriaId: categoriaB, precoPromocionalCentavos: 100 }),
      ],
      ['GET produto', () => app.http().get(`${prod()}/${produtoB}`).set(comoA())],
      ['PATCH produto', () => app.http().patch(`${prod()}/${produtoB}`).set(comoA()).send({ nome: 'X' })],
      ['DELETE produto', () => app.http().delete(`${prod()}/${produtoB}`).set(comoA())],
      [
        'PUT foto',
        async () => {
          const { arquivo, opcoes } = await foto();
          return app.http().put(`${prod()}/${produtoB}/foto`).set(comoA()).attach('foto', arquivo, opcoes);
        },
      ],
      ['DELETE foto', () => app.http().delete(`${prod()}/${produtoB}/foto`).set(comoA())],
    ])(
      'Quando A faz %s com ids de B, então 404 e os dados de B ficam intactos',
      async (_operacao, chamar) => {
        const antes = await dadosDeB();
        const r = await chamar();
        expect(r.status).toBe(404);
        expect(r.body.erro.codigo).toBe('RECURSO_NAO_ENCONTRADO');
        expect(await dadosDeB()).toEqual(antes);
      },
    );
  });

  describe('Esquema do Cenário: mistura de ids próprios e alheios', () => {
    const base = () => `/v1/painel/filiais/${filialA}`;
    it.each([
      [
        'GET produto de B na filial de A',
        () => app.http().get(`${base()}/produtos/${produtoB}`).set(comoA()),
      ],
      [
        'PATCH categoria de B na filial de A',
        () => app.http().patch(`${base()}/categorias/${categoriaB}`).set(comoA()).send({ nome: 'X' }),
      ],
      [
        'POST produto na filial de A com categoria de B',
        () =>
          app
            .http()
            .post(`${base()}/produtos`)
            .set(comoA())
            .send({ nome: 'X', categoriaId: categoriaB, precoPromocionalCentavos: 100 }),
      ],
      [
        'PATCH produto de A movendo para categoria de B',
        () =>
          app.http().patch(`${base()}/produtos/${produtoA}`).set(comoA()).send({ categoriaId: categoriaB }),
      ],
    ])('Quando A faz %s, então 404', async (_operacao, chamar) => {
      const r = await chamar();
      expect(r.status).toBe(404);
      expect(r.body.erro.codigo).toBe('RECURSO_NAO_ENCONTRADO');
    });
  });

  describe('Cenário: busca não vaza', () => {
    it('Então A não acha "Exclusivo B"', async () => {
      const r = await app.http().get(`/v1/painel/filiais/${filialA}/produtos?busca=exclusivo`).set(comoA());
      expect(r.status).toBe(200);
      expect(r.body.total).toBe(0);
    });
  });
});
