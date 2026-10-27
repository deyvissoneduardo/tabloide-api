import { v7 as uuidv7 } from 'uuid';
import { StatusLojista } from '../../../src/modules/lojistas/models/status-lojista';
import { ALFABETO_CODIGO } from '../../../src/modules/filiais/services/gerador-codigo-publico';
import { criarCategoria } from '../../factories/categoria.factory';
import { criarFilial, type FilialCriada } from '../../factories/filial.factory';
import { umLojista, type LojistaCriado } from '../../factories/lojista.factory';
import { criarPanfleto } from '../../factories/panfleto.factory';
import { criarProduto } from '../../factories/produto.factory';
import { criarApp, ipNovo, type AppDeTeste } from '../../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, type BancoDeTeste } from '../../helpers/banco-de-teste';

describe('Funcionalidade: A página pública nunca expõe dados de outro tenant nem ids internos (RNF04, RNF05)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let a: LojistaCriado;
  let b: LojistaCriado;
  let fa: FilialCriada;
  let fa2: FilialCriada;
  let fb: FilialCriada;
  const publica = (codigo: string) =>
    app.http().get(`/v1/publico/filiais/${codigo}`).set('X-Forwarded-For', ipNovo());
  const nomes = (body: {
    estrutura: { categorias: Array<{ nome: string; produtos: Array<{ nome: string }> }> };
  }) => body.estrutura.categorias.flatMap((c) => c.produtos.map((p) => `${c.nome}/${p.nome}`));

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
    a = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    b = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    fa = await criarFilial(app, a.token, { nome: 'FA' });
    fa2 = await criarFilial(app, a.token, { nome: 'FA2' });
    fb = await criarFilial(app, b.token, { nome: 'FB' });
    const ca = await criarCategoria(app, a.token, fa.id, 'Bebidas');
    const ca2 = await criarCategoria(app, a.token, fa2.id, 'Bebidas');
    const cb = await criarCategoria(app, b.token, fb.id, 'Bebidas');
    await criarProduto(app, a.token, fa.id, ca.id, { nome: 'Cola A' });
    await criarProduto(app, a.token, fa2.id, ca2.id, { nome: 'Cola A2' });
    await criarProduto(app, b.token, fb.id, cb.id, { nome: 'Cola B' });
    await criarPanfleto(app, a.token, fa.id, { dataLimite: '2026-10-25' });
    await app
      .http()
      .patch('/v1/painel/lojista/identidade')
      .set('Authorization', `Bearer ${b.token}`)
      .send({ nomeFantasia: 'Mercado B' })
      .expect(200);
  });
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  describe('Cenário: página de FA só tem dados de FA', () => {
    it('Então aparece "Cola A", não aparecem "Cola B" nem "Cola A2", e o lojista é A', async () => {
      const r = await publica(fa.codigoPublico);
      expect(nomes(r.body)).toEqual(['Bebidas/Cola A']);
      expect(r.body.lojista.nome).toBe('Mercado Bom Preço');
    });
  });

  describe('Cenário: categorias homônimas de tenants diferentes não se misturam', () => {
    it('Então cada "Bebidas" contém só os produtos do seu tenant', async () => {
      expect(nomes((await publica(fb.codigoPublico)).body)).toEqual(['Bebidas/Cola B']);
      expect((await publica(fb.codigoPublico)).body.lojista.nome).toBe('Mercado B');
    });
  });

  describe('Cenário: produto adulterado com tenant divergente não aparece', () => {
    it('Então as consultas filtram tenant_id e filial_id', async () => {
      const [[categoriaB]] = (await banco.sequelize.query(
        'SELECT id FROM categorias WHERE tenant_id = :b LIMIT 1',
        { replacements: { b: b.id } },
      )) as [Array<{ id: string }>, unknown];
      await banco.sequelize.query(
        `INSERT INTO produtos (id, tenant_id, filial_id, categoria_id, nome, nome_normalizado,
                               preco_promocional_centavos, data_inicio)
         VALUES (:id, :b, :fa, :c, 'Adulterado', 'adulterado', 100, '2026-10-01')`,
        { replacements: { id: uuidv7(), b: b.id, fa: fa.id, c: categoriaB!.id } },
      );
      await app.http().patch(`/v1/painel/filiais/${fa.id}`).set('Authorization', `Bearer ${a.token}`).send({
        nome: 'FA',
      });
      expect(nomes((await publica(fa.codigoPublico)).body)).not.toContain('Bebidas/Adulterado');
    });
  });

  describe('Cenário: resposta sem identificadores internos', () => {
    it('Então nenhum UUID do banco aparece e nenhum path interno fica fora das URLs', async () => {
      // RN44: com a chave ligada o panfleto de FA entra na resposta
      const identidade = (sePanfleto: boolean) =>
        app
          .http()
          .patch('/v1/painel/lojista/identidade')
          .set('Authorization', `Bearer ${a.token}`)
          .send({ sePanfleto })
          .expect(200);
      await identidade(true);
      const r = await publica(fa.codigoPublico);
      await identidade(false);
      const [linhas] = await banco.sequelize.query(
        `SELECT id::text FROM lojistas UNION ALL SELECT id::text FROM filiais
         UNION ALL SELECT id::text FROM categorias UNION ALL SELECT id::text FROM produtos
         UNION ALL SELECT id::text FROM panfletos`,
      );
      const ids = (linhas as Array<{ id: string }>).map((l) => l.id);
      // o tenant aparece só como prefixo do path dentro de URLs públicas
      const semUrls = r.text.replace(/"https?:\/\/[^"]+"/g, '""');
      for (const id of ids) expect(semUrls).not.toContain(id);
      expect(r.body.panfleto.arquivoUrl).toMatch(/^http:\/\/localhost\/v1\/midia-local\/.+\.webp$/);
      expect(semUrls).not.toMatch(/\.webp/);
    });
  });

  describe('Cenário: cache não cruza tenants', () => {
    it('Então editar a identidade de A não muda a página nem o ETag de FB', async () => {
      const antes = await publica(fb.codigoPublico);
      await publica(fa.codigoPublico);
      await app
        .http()
        .patch('/v1/painel/lojista/identidade')
        .set('Authorization', `Bearer ${a.token}`)
        .send({ corPrimaria: '#123456' })
        .expect(200);
      const depois = await publica(fb.codigoPublico);
      expect(depois.headers.etag).toBe(antes.headers.etag);
      expect(depois.body.lojista.corPrimaria).toBeNull();
      expect((await publica(fa.codigoPublico)).body.lojista.corPrimaria).toBe('#123456');
    });
  });

  describe('Cenário: códigos não são enumeráveis por resposta', () => {
    it('Então 100 códigos válidos inexistentes recebem o mesmo 404', async () => {
      const aleatorio = () =>
        Array.from(
          { length: 8 },
          () => ALFABETO_CODIGO[Math.floor(Math.random() * ALFABETO_CODIGO.length)],
        ).join('');
      const respostas = await Promise.all(Array.from({ length: 100 }, () => publica(aleatorio())));
      const assinaturas = new Set(
        respostas.map((r) => JSON.stringify([r.status, r.text, r.headers['cache-control'], r.headers.etag])),
      );
      expect([...assinaturas]).toEqual([
        JSON.stringify([
          404,
          JSON.stringify({ erro: { codigo: 'RECURSO_NAO_ENCONTRADO', mensagem: 'Página não encontrada.' } }),
          'public, max-age=10',
          undefined,
        ]),
      ]);
    });
  });
});
