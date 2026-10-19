import { existsSync } from 'node:fs';
import path from 'node:path';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Produto } from '../../src/modules/produtos/models/produto.model';
import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { criarCategoria, type CategoriaCriada } from '../factories/categoria.factory';
import { criarFilial, type FilialCriada } from '../factories/filial.factory';
import { definirStatus, umLojista, type LojistaCriado } from '../factories/lojista.factory';
import { criarProduto, inserirProduto } from '../factories/produto.factory';
import { criarApp, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, limparBanco, type BancoDeTeste } from '../helpers/banco-de-teste';
import { imagens } from '../helpers/imagens';

/** Relógio dos testes de integração: 2026-10-18T12:00Z, hoje = 2026-10-18 em São Paulo. */
describe('Funcionalidade: Categorias e produtos no banco real', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let lojista: LojistaCriado;
  let filial: FilialCriada;
  let categoria: CategoriaCriada;
  const sql = <T extends object = Record<string, unknown>>(
    q: string,
    replacements?: Record<string, unknown>,
  ) => banco.sequelize.query<T>(q, { replacements, type: QueryTypes.SELECT });
  const auth = () => ({ Authorization: `Bearer ${lojista.token}` });
  const base = (filialId = filial.id) => `/v1/painel/filiais/${filialId}`;
  const inserir = (campos: {
    inicio: string;
    limite: string | null;
    excluido?: boolean;
    categoriaId?: string;
  }) =>
    inserirProduto(banco.sequelize, {
      tenantId: lojista.id,
      filialId: filial.id,
      categoriaId: categoria.id,
      ...campos,
    });

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
  });
  beforeEach(async () => {
    lojista = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    filial = await criarFilial(app, lojista.token);
    categoria = await criarCategoria(app, lojista.token, filial.id, 'Bebidas');
  });
  afterEach(() => limparBanco(banco));
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  describe('Funcionalidade: Constraints do banco', () => {
    const inserirCru = (
      promocional: number,
      original: number | null,
      inicio = '2026-10-18',
      limite: string | null = null,
    ) =>
      banco.sequelize.query(
        `INSERT INTO produtos (id, tenant_id, filial_id, categoria_id, nome, nome_normalizado,
                               preco_promocional_centavos, preco_original_centavos, data_inicio, data_limite)
         VALUES (gen_random_uuid(), :t, :f, :c, 'X', 'x', :promocional, :original, :inicio, :limite)`,
        {
          replacements: {
            t: lojista.id,
            f: filial.id,
            c: categoria.id,
            promocional,
            original,
            inicio,
            limite,
          },
        },
      );

    it.each([
      [
        'preço original igual ao promocional (RN21)',
        () => inserirCru(1000, 1000),
        'produtos_preco_original_ck',
      ],
      ['preço promocional zero', () => inserirCru(0, null), 'produtos_preco_promocional_ck'],
      [
        'data limite antes do início',
        () => inserirCru(1000, null, '2026-10-20', '2026-10-19'),
        'produtos_datas_ck',
      ],
    ])('Cenário: CHECK recusa %s', async (_nome, inserirInvalido, constraint) => {
      await expect(inserirInvalido()).rejects.toMatchObject({ parent: { code: '23514', constraint } });
    });

    it('Cenário: nome de categoria único entre as ativas, sem diferenciar acento e caixa (D4.4)', async () => {
      const r = await app.http().post(`${base()}/categorias`).set(auth()).send({ nome: 'bébidas' });
      expect(r.status).toBe(409);
      expect(r.body.erro.codigo).toBe('CATEGORIA_JA_EXISTE');
    });

    it('Cenário: nome repetido depois de excluir a categoria', async () => {
      await app.http().delete(`${base()}/categorias/${categoria.id}`).set(auth()).expect(204);
      await app.http().post(`${base()}/categorias`).set(auth()).send({ nome: 'Bebidas' }).expect(201);
    });

    it('Cenário: mesmo nome em filiais diferentes', async () => {
      const outra = await criarFilial(app, lojista.token, { nome: 'Outra' });
      await app
        .http()
        .post(`${base(outra.id)}/categorias`)
        .set(auth())
        .send({ nome: 'Bebidas' })
        .expect(201);
    });

    it('Cenário: DATEONLY volta como string', async () => {
      const { id } = await criarProduto(app, lojista.token, filial.id, categoria.id, {
        dataLimite: '2026-10-25',
      });
      const sequelize = app.app.get(Sequelize);
      const produto = await sequelize.models.Produto!.findOne({ where: { id, tenantId: lojista.id } });
      expect((produto as Produto).dataLimite).toBe('2026-10-25');
    });

    it('Cenário: o hook preenche nome_normalizado no cadastro e no renomear', async () => {
      await app
        .http()
        .patch(`${base()}/categorias/${categoria.id}`)
        .set(auth())
        .send({ nome: 'Frios e Laticínios' })
        .expect(200);
      await criarProduto(app, lojista.token, filial.id, categoria.id, { nome: 'Açúcar Refinado' });
      const [cat] = await sql<{ nome_normalizado: string }>('SELECT nome_normalizado FROM categorias');
      const [prod] = await sql<{ nome_normalizado: string }>('SELECT nome_normalizado FROM produtos');
      expect(cat!.nome_normalizado).toBe('frios e laticinios');
      expect(prod!.nome_normalizado).toBe('acucar refinado');
    });
  });

  describe('Funcionalidade: Fluxos HTTP', () => {
    it('Cenário: cadastro multipart ponta a ponta', async () => {
      const r = await app
        .http()
        .post(`${base()}/produtos`)
        .set(auth())
        .field('nome', 'Arroz Tipo 1')
        .field('categoriaId', categoria.id)
        .field('quantidade', '5kg')
        .field('precoPromocionalCentavos', '2199')
        .field('precoOriginalCentavos', '2649')
        .field('observacao', 'Limite 3 por cliente')
        .field('dataLimite', '2026-10-25')
        .attach('foto', await imagens.jpeg(1200, 1200), { filename: 'arroz.jpg', contentType: 'image/jpeg' });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({
        categoria: { id: categoria.id, nome: 'Bebidas' },
        precoPromocionalCentavos: 2199,
        precoOriginalCentavos: 2649,
        dataInicio: '2026-10-18',
        situacao: 'VIGENTE',
        editavel: true,
        dataInicioEditavel: false,
      });
      expect(r.body.urlFoto).toMatch(new RegExp(`/${lojista.id}/produto/[0-9a-f-]+\\.webp$`));
      const caminho = r.body.urlFoto.replace('http://localhost/v1/midia-local/', '');
      expect(existsSync(path.join(app.midiaDir, caminho))).toBe(true);
      expect(r.body).not.toHaveProperty('fotoPath');
      expect(r.body).not.toHaveProperty('tenantId');
    });

    it('Cenário: cadastro mínimo em JSON começa hoje (RN40) e audita a criação (D4.11)', async () => {
      const r = await app
        .http()
        .post(`${base()}/produtos`)
        .set(auth())
        .send({ nome: 'Leite Integral', categoriaId: categoria.id, precoPromocionalCentavos: 499 })
        .expect(201);
      expect(r.body).toMatchObject({ dataInicio: '2026-10-18', dataLimite: null, urlFoto: null });
      const linhas = await sql<{ campo: string; valor_novo: string }>(
        `SELECT campo, valor_novo FROM auditoria_alteracoes WHERE entidade = 'PRODUTO' AND entidade_id = :id ORDER BY campo`,
        { id: r.body.id },
      );
      expect(linhas).toEqual([
        { campo: 'dataInicio', valor_novo: '2026-10-18' },
        { campo: 'precoPromocionalCentavos', valor_novo: '499' },
      ]);
    });

    it('Cenário: listar categorias com contagens reais', async () => {
      await inserir({ inicio: '2026-10-10', limite: '2026-10-25' });
      await inserir({ inicio: '2026-10-20', limite: null });
      await inserir({ inicio: '2026-10-01', limite: '2026-10-17' });
      await inserir({ inicio: '2026-10-10', limite: '2026-10-25', excluido: true });
      const r = await app.http().get(`${base()}/categorias`).set(auth()).expect(200);
      expect(r.body.itens).toEqual([
        expect.objectContaining({
          id: categoria.id,
          nome: 'Bebidas',
          produtos: { vigentes: 1, agendados: 1, vencidos: 1 },
          podeExcluir: false,
        }),
      ]);
    });

    it('Cenário: categorias em ordem alfabética pt-BR', async () => {
      await criarCategoria(app, lojista.token, filial.id, 'Óleos');
      await criarCategoria(app, lojista.token, filial.id, 'açougue');
      const r = await app.http().get(`${base()}/categorias`).set(auth()).expect(200);
      expect(r.body.itens.map((c: { nome: string }) => c.nome)).toEqual(['açougue', 'Bebidas', 'Óleos']);
    });

    it('Cenário: exclusão de categoria com vencidos leva os vencidos junto (RN20)', async () => {
      await inserir({ inicio: '2026-10-01', limite: '2026-10-10' });
      await inserir({ inicio: '2026-10-01', limite: '2026-10-17' });
      await app.http().delete(`${base()}/categorias/${categoria.id}`).set(auth()).expect(204);
      const linhas = await sql<{ n: string }>(
        `SELECT (SELECT count(*) FROM produtos WHERE deleted_at IS NOT NULL)
              + (SELECT count(*) FROM categorias WHERE deleted_at IS NOT NULL) AS n`,
      );
      expect(Number(linhas[0]!.n)).toBe(3);
    });

    it('Cenário: exclusão de categoria com vigente é bloqueada', async () => {
      await criarProduto(app, lojista.token, filial.id, categoria.id);
      const r = await app.http().delete(`${base()}/categorias/${categoria.id}`).set(auth());
      expect(r.status).toBe(409);
      expect(r.body.erro).toMatchObject({
        codigo: 'CATEGORIA_COM_PRODUTOS_ATIVOS',
        detalhes: { vigentes: 1, agendados: 0 },
      });
    });

    it('Cenário: edição de preço auditada', async () => {
      const { id } = await criarProduto(app, lojista.token, filial.id, categoria.id, {
        precoPromocionalCentavos: 2199,
      });
      const contar = async () =>
        Number(
          (
            await sql<{ n: string }>(
              'SELECT count(*) AS n FROM auditoria_alteracoes WHERE entidade_id = :id',
              { id },
            )
          )[0]!.n,
        );
      const antes = await contar();
      await app
        .http()
        .patch(`${base()}/produtos/${id}`)
        .set(auth())
        .send({ precoPromocionalCentavos: 1999 })
        .expect(200);
      const novas = await sql(
        `SELECT campo, valor_anterior, valor_novo FROM auditoria_alteracoes
         WHERE entidade = 'PRODUTO' AND entidade_id = :id AND valor_anterior IS NOT NULL`,
        { id },
      );
      expect(await contar()).toBe(antes + 1);
      expect(novas).toEqual([
        { campo: 'precoPromocionalCentavos', valor_anterior: '2199', valor_novo: '1999' },
      ]);
    });

    it('Cenário: edição só de nome não audita', async () => {
      const { id } = await criarProduto(app, lojista.token, filial.id, categoria.id);
      const contar = async () =>
        (await sql('SELECT 1 FROM auditoria_alteracoes WHERE entidade_id = :id', { id })).length;
      const antes = await contar();
      const r = await app
        .http()
        .patch(`${base()}/produtos/${id}`)
        .set(auth())
        .send({ nome: 'Novo nome' })
        .expect(200);
      expect(r.body.nome).toBe('Novo nome');
      expect(await contar()).toBe(antes);
    });

    it('Cenário: trocar de categoria, editar vencido e excluir', async () => {
      const outra = await criarCategoria(app, lojista.token, filial.id, 'Mercearia');
      const { id } = await criarProduto(app, lojista.token, filial.id, categoria.id);
      const r = await app
        .http()
        .patch(`${base()}/produtos/${id}`)
        .set(auth())
        .send({ categoriaId: outra.id });
      expect(r.status).toBe(200);
      expect(r.body.categoria).toEqual({ id: outra.id, nome: 'Mercearia' });

      const vencido = await inserir({ inicio: '2026-10-01', limite: '2026-10-17' });
      const e = await app.http().patch(`${base()}/produtos/${vencido}`).set(auth()).send({ nome: 'X' });
      expect(e.status).toBe(409);
      expect(e.body.erro.codigo).toBe('ITEM_NAO_EDITAVEL');

      await app.http().delete(`${base()}/produtos/${vencido}`).set(auth()).expect(204);
      const d = await app.http().delete(`${base()}/produtos/${vencido}`).set(auth());
      expect(d.status).toBe(409);
      const obtido = await app.http().get(`${base()}/produtos/${vencido}`).set(auth()).expect(200);
      expect(obtido.body).toMatchObject({ situacao: 'EXCLUIDO', editavel: false });
      expect(obtido.body.excluidoEm).not.toBeNull();
    });

    it('Cenário: lista com busca sem acento, filtro e paginação', async () => {
      await criarProduto(app, lojista.token, filial.id, categoria.id, { nome: 'Açúcar Cristal' });
      await criarProduto(app, lojista.token, filial.id, categoria.id, { nome: 'açúcar refinado' });
      await criarProduto(app, lojista.token, filial.id, categoria.id, {
        nome: 'Arroz',
        dataInicio: '2026-10-20',
      });
      await criarProduto(app, lojista.token, filial.id, categoria.id, { nome: 'Feijão 100% natural' });

      const busca = await app.http().get(`${base()}/produtos?busca=ACUCAR`).set(auth()).expect(200);
      expect(busca.body.itens.map((p: { nome: string }) => p.nome)).toEqual([
        'Açúcar Cristal',
        'açúcar refinado',
      ]);

      const curinga = await app.http().get(`${base()}/produtos?busca=0%25`).set(auth()).expect(200);
      expect(curinga.body.total).toBe(1);

      const agendados = await app.http().get(`${base()}/produtos?situacao=AGENDADO`).set(auth()).expect(200);
      expect(agendados.body.itens.map((p: { nome: string }) => p.nome)).toEqual(['Arroz']);

      const pagina = await app.http().get(`${base()}/produtos?pagina=2&porPagina=3`).set(auth()).expect(200);
      expect(pagina.body).toMatchObject({ total: 4, pagina: 2, porPagina: 3 });
      expect(pagina.body.itens.map((p: { nome: string }) => p.nome)).toEqual(['Feijão 100% natural']);
    });

    it('Cenário: trocar e remover a foto', async () => {
      const { id } = await criarProduto(app, lojista.token, filial.id, categoria.id);
      const trocada = await app
        .http()
        .put(`${base()}/produtos/${id}/foto`)
        .set(auth())
        .attach('foto', await imagens.png(200, 200), { filename: 'a.png', contentType: 'image/png' });
      expect(trocada.status).toBe(200);
      expect(trocada.body.urlFoto).toMatch(/\.webp$/);
      const removida = await app.http().delete(`${base()}/produtos/${id}/foto`).set(auth()).expect(200);
      expect(removida.body.urlFoto).toBeNull();
      const semArquivo = await app.http().put(`${base()}/produtos/${id}/foto`).set(auth());
      expect(semArquivo.status).toBe(400);
    });

    it('Cenário: cascata da filial (RN12)', async () => {
      const outra = await criarFilial(app, lojista.token, { nome: 'Outra' });
      const catOutra = await criarCategoria(app, lojista.token, outra.id, 'Bebidas');
      await criarProduto(app, lojista.token, outra.id, catOutra.id);
      await criarCategoria(app, lojista.token, filial.id, 'Mercearia');
      for (let i = 0; i < 5; i++)
        await criarProduto(app, lojista.token, filial.id, categoria.id, { nome: `P${i}` });

      await app.http().delete(`/v1/painel/filiais/${filial.id}`).set(auth()).expect(204);
      const ativos = await sql<{ tabela: string; filial_id: string }>(
        `SELECT 'categorias' AS tabela, filial_id FROM categorias WHERE deleted_at IS NULL
         UNION ALL SELECT 'produtos', filial_id FROM produtos WHERE deleted_at IS NULL`,
      );
      expect(ativos).toHaveLength(2);
      expect(ativos.every((l) => l.filial_id === outra.id)).toBe(true);
    });

    it('Cenário: lojista desativado não escreve, mas lê', async () => {
      const { id } = await criarProduto(app, lojista.token, filial.id, categoria.id);
      await definirStatus(banco.sequelize, lojista.id, StatusLojista.DESATIVADO);
      const respostas = await Promise.all([
        app.http().post(`${base()}/produtos`).set(auth()).send({}),
        app.http().patch(`${base()}/produtos/${id}`).set(auth()).send({ nome: 'X' }),
        app.http().delete(`${base()}/categorias/${categoria.id}`).set(auth()),
        app
          .http()
          .put(`${base()}/produtos/${id}/foto`)
          .set(auth())
          .attach('foto', await imagens.jpeg(10, 10), { filename: 'a.jpg', contentType: 'image/jpeg' }),
      ]);
      for (const r of respostas) {
        expect(r.status).toBe(403);
        expect(r.body.erro.codigo).toBe('LOJISTA_DESATIVADO');
      }
      await app.http().get(`${base()}/produtos`).set(auth()).expect(200);
    });
  });

  describe('Funcionalidade: Concorrência (D4.6)', () => {
    it.each([1, 2, 3, 4, 5])(
      'Cenário: excluir categoria e cadastrar produto nela em paralelo (rodada %i)',
      async () => {
        await inserir({ inicio: '2026-10-01', limite: '2026-10-17' });
        const [exclusao, cadastro] = await Promise.all([
          app.http().delete(`${base()}/categorias/${categoria.id}`).set(auth()),
          app
            .http()
            .post(`${base()}/produtos`)
            .set(auth())
            .send({ nome: 'Corrida', categoriaId: categoria.id, precoPromocionalCentavos: 100 }),
        ]);
        expect([
          [204, 404],
          [409, 201],
        ]).toContainEqual([exclusao.status, cadastro.status]);
        const orfaos = await sql(
          `SELECT p.id FROM produtos p JOIN categorias c ON c.id = p.categoria_id
           WHERE p.deleted_at IS NULL AND c.deleted_at IS NOT NULL`,
        );
        expect(orfaos).toEqual([]);
      },
    );
  });

  describe('Cenário: a consulta crua de categorias filtra por tenant', () => {
    it('Então o SQL tem tenant_id em categorias e em produtos', async () => {
      const sequelize = app.app.get(Sequelize);
      const espiao = jest.spyOn(sequelize, 'query');
      await app.http().get(`${base()}/categorias`).set(auth()).expect(200);
      const consulta = espiao.mock.calls.map(([q]) => String(q)).find((q) => q.includes('FROM categorias c'));
      espiao.mockRestore();
      expect(consulta).toContain('c.tenant_id = :tenantId');
      expect(consulta).toContain('p.tenant_id = :tenantId');
    });
  });
});
