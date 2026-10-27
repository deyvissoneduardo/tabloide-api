import { v7 as uuidv7 } from 'uuid';
import { StatusLojista } from '../../../src/modules/lojistas/models/status-lojista';
import { PaginaPublicaCache } from '../../../src/modules/publico/services/pagina-publica.cache';
import { criarCategoria, type CategoriaCriada } from '../../factories/categoria.factory';
import { umEndereco } from '../../factories/endereco-filial.factory';
import { criarFilial, type FilialCriada } from '../../factories/filial.factory';
import { definirStatus, umLojista, type LojistaCriado } from '../../factories/lojista.factory';
import { criarProduto, inserirProduto } from '../../factories/produto.factory';
import { AGORA_FIXO, criarApp, ipNovo, relogio, type AppDeTeste } from '../../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, limparBanco, type BancoDeTeste } from '../../helpers/banco-de-teste';

/** Relógio padrão: 2026-10-18T12:00Z, hoje = 2026-10-18 em São Paulo. */
describe('Funcionalidade: Página pública ponta a ponta', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let lojista: LojistaCriado;
  let filial: FilialCriada;
  let categoria: CategoriaCriada;
  const sql = (q: string, replacements?: Record<string, unknown>) =>
    banco.sequelize.query(q, { replacements });
  const auth = () => ({ Authorization: `Bearer ${lojista.token}` });
  const publica = (codigo = filial.codigoPublico, ip = ipNovo()) =>
    app.http().get(`/v1/publico/filiais/${codigo}`).set('X-Forwarded-For', ip);
  const cache = () => app.app.get(PaginaPublicaCache);
  const produto = (campos: { nome?: string; inicio: string; limite: string | null; excluido?: boolean }) =>
    inserirProduto(banco.sequelize, {
      tenantId: lojista.id,
      filialId: filial.id,
      categoriaId: categoria.id,
      ...campos,
    });
  const panfleto = (inicio: string, limite: string | null, excluido = false) =>
    sql(
      `INSERT INTO panfletos (id, tenant_id, filial_id, imagem_path, imagem_largura, imagem_altura, data_inicio, data_limite, deleted_at)
       VALUES (:id, :t, :f, :caminho, 1600, 2263, :inicio, :limite, :deletedAt)`,
      {
        id: uuidv7(),
        t: lojista.id,
        f: filial.id,
        caminho: `${lojista.id}/panfleto/${inicio}.webp`,
        inicio,
        limite,
        deletedAt: excluido ? new Date('2026-10-15T12:00:00Z') : null,
      },
    );
  const nomes = (body: { estrutura: { categorias: Array<{ produtos: Array<{ nome: string }> }> } }) =>
    body.estrutura.categorias.flatMap((c) => c.produtos.map((p) => p.nome));
  /** RN44: liga ou desliga "mostrar só o panfleto" pela rota real (o evento invalida o cache). */
  const sePanfleto = (valor: boolean) =>
    app.http().patch('/v1/painel/lojista/identidade').set(auth()).send({ sePanfleto: valor }).expect(200);

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
  });
  beforeEach(async () => {
    relogio.agora = AGORA_FIXO;
    cache().limpar();
    lojista = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    filial = await criarFilial(app, lojista.token, { nome: 'Centro' });
    categoria = await criarCategoria(app, lojista.token, filial.id, 'Mercearia');
  });
  afterEach(() => limparBanco(banco));
  afterAll(async () => {
    relogio.agora = AGORA_FIXO;
    await app?.fechar();
    await encerrarBanco(banco);
  });

  describe('Cenário: página completa sem autenticação (RN27, RN28)', () => {
    it('Então 200 com identidade, filial, hoje e headers de cache', async () => {
      await criarProduto(app, lojista.token, filial.id, categoria.id, {
        nome: 'Açúcar refinado',
        precoPromocionalCentavos: 459,
        precoOriginalCentavos: 529,
        quantidade: '1 kg',
      });
      const r = await publica();
      expect(r.status).toBe(200);
      expect(r.headers['cache-control']).toBe('public, max-age=30, stale-while-revalidate=300');
      expect(r.headers.etag).toMatch(/^W\/"[A-Za-z0-9_-]{16}"$/);
      expect(r.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(r.body).toMatchObject({
        lojista: { nome: 'Mercado Bom Preço', logoUrl: null, corPrimaria: null, corSecundaria: null },
        filial: { nome: 'Centro', endereco: umEndereco() },
        sePanfleto: false,
        panfleto: null,
        estrutura: {
          categorias: [
            {
              nome: 'Mercearia',
              produtos: [
                {
                  nome: 'Açúcar refinado',
                  quantidade: '1 kg',
                  precoPromocionalCentavos: 459,
                  precoOriginalCentavos: 529,
                },
              ],
            },
          ],
        },
        hoje: '2026-10-18',
      });
      expect(r.body.geradoEm).toBe(AGORA_FIXO.toISOString());
    });
  });

  describe('Cenário: filtro real de vigência do panfleto (RN14, RN23)', () => {
    it('Então hoje mostra o vigente; em 26/10 mostra o agendado, sem validoAte', async () => {
      await panfleto('2026-10-01', '2026-10-17');
      await panfleto('2026-10-18', '2026-10-25');
      await panfleto('2026-10-26', null);
      await sePanfleto(true);
      const hoje = await publica();
      expect(hoje.body.panfleto).toEqual({
        tipo: 'IMAGEM',
        arquivoUrl: expect.stringMatching(/2026-10-18\.webp$/),
        largura: 1600,
        altura: 2263,
        validoAte: '2026-10-25',
      });

      relogio.agora = new Date('2026-10-26T03:00:00Z');
      const depois = await publica();
      expect(depois.body.hoje).toBe('2026-10-26');
      expect(depois.body.panfleto.arquivoUrl).toMatch(/2026-10-26\.webp$/);
      expect(depois.body.panfleto).not.toHaveProperty('validoAte');
    });
  });

  describe('Cenário: panfleto excluído não aparece mesmo vigente', () => {
    it('Então panfleto é null', async () => {
      await panfleto('2026-10-10', '2026-10-25', true);
      await sePanfleto(true);
      expect((await publica()).body.panfleto).toBeNull();
    });
  });

  describe('Cenário: filtro real de vigência dos produtos (RN23, RN24)', () => {
    it('Então aparecem só "vence hoje" e "vigente sem limite"', async () => {
      await produto({ nome: 'Vencido ontem', inicio: '2026-10-01', limite: '2026-10-17' });
      await produto({ nome: 'Vence hoje', inicio: '2026-10-10', limite: '2026-10-18' });
      await produto({ nome: 'Vigente sem limite', inicio: '2026-10-01', limite: null });
      await produto({ nome: 'Agendado amanhã', inicio: '2026-10-19', limite: null });
      await produto({ nome: 'Excluído', inicio: '2026-10-01', limite: null, excluido: true });
      const r = await publica();
      expect(nomes(r.body)).toEqual(['Vence hoje', 'Vigente sem limite']);
      expect(r.body.estrutura.categorias[0].produtos[0].validoAte).toBe('2026-10-18');
      expect(r.body.estrutura.categorias[0].produtos[1]).not.toHaveProperty('validoAte');
    });
  });

  describe('Cenário: data limite vale até 23:59 do dia no fuso da filial', () => {
    it('Então às 23:59:59 aparece e às 00:00 já não aparece', async () => {
      await produto({ nome: 'Último dia', inicio: '2026-10-10', limite: '2026-10-18' });
      relogio.agora = new Date('2026-10-19T02:59:59Z');
      expect(nomes((await publica()).body)).toEqual(['Último dia']);
      relogio.agora = new Date('2026-10-19T03:00:00Z');
      expect(nomes((await publica()).body)).toEqual([]);
    });
  });

  describe('Cenário: produto vigente em categoria excluída não aparece', () => {
    it('Então a categoria some da página', async () => {
      await produto({ nome: 'Órfão', inicio: '2026-10-01', limite: null });
      await sql('UPDATE categorias SET deleted_at = now() WHERE id = :id', { id: categoria.id });
      expect((await publica()).body.estrutura.categorias).toEqual([]);
    });
  });

  describe('Cenário: ordenação pt-BR real com acentos (RN30)', () => {
    it('Então categorias e produtos em ordem alfabética, ignorando acento e caixa', async () => {
      const bebidas = await criarCategoria(app, lojista.token, filial.id, 'bebidas');
      const acougue = await criarCategoria(app, lojista.token, filial.id, 'Açougue');
      for (const nome of ['Água', 'Açúcar', 'abacate'])
        await criarProduto(app, lojista.token, filial.id, categoria.id, { nome });
      await criarProduto(app, lojista.token, filial.id, bebidas.id, { nome: 'Suco' });
      await criarProduto(app, lojista.token, filial.id, acougue.id, { nome: 'Picanha' });
      const r = await publica();
      expect(r.body.estrutura.categorias.map((c: { nome: string }) => c.nome)).toEqual([
        'Açougue',
        'bebidas',
        'Mercearia',
      ]);
      expect(r.body.estrutura.categorias[2].produtos.map((p: { nome: string }) => p.nome)).toEqual([
        'abacate',
        'Açúcar',
        'Água',
      ]);
    });
  });

  describe('Funcionalidade: Regra de exibição e ordem do lojista (RN44, RN45)', () => {
    describe('Cenário: ordem gravada pelo PUT aparece na página', () => {
      it('Então categorias e produtos seguem a ordem do lojista, com o não posicionado no fim', async () => {
        const bebidas = await criarCategoria(app, lojista.token, filial.id, 'Bebidas');
        const suco = await criarProduto(app, lojista.token, filial.id, bebidas.id, { nome: 'Suco' });
        const agua = await criarProduto(app, lojista.token, filial.id, bebidas.id, { nome: 'Água' });
        await criarProduto(app, lojista.token, filial.id, bebidas.id, { nome: 'Abacaxi' });
        await criarProduto(app, lojista.token, filial.id, categoria.id, { nome: 'Arroz' });
        await publica().expect(200);
        await app
          .http()
          .put(`/v1/painel/filiais/${filial.id}/estrutura`)
          .set(auth())
          .send({ categorias: [{ id: bebidas.id, produtos: [suco.id, agua.id] }] })
          .expect(200);
        const r = await publica();
        expect(r.body.estrutura.categorias.map((c: { nome: string }) => c.nome)).toEqual([
          'Bebidas',
          'Mercearia',
        ]);
        expect(nomes(r.body)).toEqual(['Suco', 'Água', 'Abacaxi', 'Arroz']);
      });
    });

    describe('Cenário: chave ligada + panfleto vigente', () => {
      it('Então só o panfleto, com a estrutura vazia', async () => {
        await produto({ nome: 'Leite', inicio: '2026-10-01', limite: null });
        await panfleto('2026-10-10', '2026-10-25');
        await sePanfleto(true);
        const r = await publica();
        expect(r.body.sePanfleto).toBe(true);
        expect(r.body.panfleto).toMatchObject({ tipo: 'IMAGEM' });
        expect(r.body.estrutura).toEqual({ categorias: [] });
      });
    });

    describe('Cenário: chave ligada sem panfleto vigente', () => {
      it('Então a estrutura com as categorias e panfleto null', async () => {
        await produto({ nome: 'Leite', inicio: '2026-10-01', limite: null });
        await sePanfleto(true);
        const r = await publica();
        expect(r.body.panfleto).toBeNull();
        expect(nomes(r.body)).toEqual(['Leite']);
      });
    });

    describe('Cenário: chave desligada', () => {
      it('Então a estrutura sem panfleto, mesmo com panfleto vigente', async () => {
        await produto({ nome: 'Leite', inicio: '2026-10-01', limite: null });
        await panfleto('2026-10-10', '2026-10-25');
        const r = await publica();
        expect(r.body.sePanfleto).toBe(false);
        expect(r.body.panfleto).toBeNull();
        expect(nomes(r.body)).toEqual(['Leite']);
      });
    });

    describe('Cenário: resposta sem os campos antigos', () => {
      it('Então não há imagemUrl nem categorias na raiz', async () => {
        await panfleto('2026-10-10', '2026-10-25');
        await sePanfleto(true);
        const r = await publica();
        expect(r.body).not.toHaveProperty('categorias');
        expect(r.text).not.toContain('imagemUrl');
      });
    });
  });

  describe('Cenário: lojista desativado no banco some após expirar o cache (RN35)', () => {
    it('Então continua em cache por até 60 s e depois responde 404', async () => {
      await publica().expect(200);
      await definirStatus(banco.sequelize, lojista.id, StatusLojista.DESATIVADO);
      relogio.agora = new Date(AGORA_FIXO.getTime() + 59_000);
      await publica().expect(200);
      relogio.agora = new Date(AGORA_FIXO.getTime() + 61_000);
      await publica().expect(404);
    });
  });

  describe('Cenário: 404 idêntico nos cinco casos (RN35)', () => {
    it('Então status, corpo e headers relevantes são iguais', async () => {
      const aguardando = await umLojista().criar(app, banco.sequelize);
      const filialAguardando = await criarFilial(app, aguardando.token);
      const desativado = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
      const filialDesativado = await criarFilial(app, desativado.token);
      await definirStatus(banco.sequelize, desativado.id, StatusLojista.DESATIVADO);
      const excluida = await criarFilial(app, lojista.token, { nome: 'Excluída' });
      await app.http().delete(`/v1/painel/filiais/${excluida.id}`).set(auth()).expect(204);

      const respostas = await Promise.all(
        [
          'abc',
          'zzzzzzzz',
          excluida.codigoPublico,
          filialAguardando.codigoPublico,
          filialDesativado.codigoPublico,
        ].map((codigo) => publica(codigo)),
      );
      for (const r of respostas) {
        expect(r.status).toBe(404);
        expect(r.text).toBe(
          JSON.stringify({ erro: { codigo: 'RECURSO_NAO_ENCONTRADO', mensagem: 'Página não encontrada.' } }),
        );
        expect(r.headers['cache-control']).toBe('public, max-age=10');
        expect(r.headers.etag).toBeUndefined();
        expect(r.headers['retry-after']).toBeUndefined();
      }
    });
  });

  describe('Cenário: ETag/304 ponta a ponta', () => {
    it('Então 304 com o mesmo ETag e 200 com ETag novo depois de editar o preço', async () => {
      const { id } = await criarProduto(app, lojista.token, filial.id, categoria.id, {
        precoPromocionalCentavos: 2199,
      });
      const primeira = await publica();
      const etag = primeira.headers.etag as string;

      const naoModificada = await publica().set('If-None-Match', etag);
      expect(naoModificada.status).toBe(304);
      expect(naoModificada.text).toBe('');
      expect(naoModificada.headers.etag).toBe(etag);

      await app
        .http()
        .patch(`/v1/painel/filiais/${filial.id}/produtos/${id}`)
        .set(auth())
        .send({ precoPromocionalCentavos: 1999 })
        .expect(200);
      const nova = await publica().set('If-None-Match', etag);
      expect(nova.status).toBe(200);
      expect(nova.headers.etag).not.toBe(etag);
      expect(nova.body.estrutura.categorias[0].produtos[0].precoPromocionalCentavos).toBe(1999);
    });

    it('E HEAD responde com o ETag e sem corpo', async () => {
      const r = await app
        .http()
        .head(`/v1/publico/filiais/${filial.codigoPublico}`)
        .set('X-Forwarded-For', ipNovo());
      expect(r.status).toBe(200);
      expect(r.headers.etag).toBeDefined();
    });
  });

  describe('Cenário: invalidação imediata após edição no painel', () => {
    it('Então o próximo GET já mostra o nome novo da filial', async () => {
      await publica().expect(200);
      await app
        .http()
        .patch(`/v1/painel/filiais/${filial.id}`)
        .set(auth())
        .send({ nome: 'Matriz' })
        .expect(200);
      expect((await publica()).body.filial.nome).toBe('Matriz');
    });

    it('E a identidade visual invalida todas as filiais do lojista', async () => {
      const outra = await criarFilial(app, lojista.token, { nome: 'Bairro' });
      await publica().expect(200);
      await publica(outra.codigoPublico).expect(200);
      await app
        .http()
        .patch('/v1/painel/lojista/identidade')
        .set(auth())
        .send({ corPrimaria: '#C8102E' })
        .expect(200);
      expect((await publica()).body.lojista.corPrimaria).toBe('#C8102E');
      expect((await publica(outra.codigoPublico)).body.lojista.corPrimaria).toBe('#C8102E');
    });
  });

  describe('Cenário: só a consulta da filial dispensa o tenant', () => {
    it('Então as consultas de panfleto e produtos filtram por tenant_id', async () => {
      await produto({ nome: 'X', inicio: '2026-10-01', limite: null });
      await sePanfleto(true); // RN44: sem a chave o panfleto nem é consultado
      const sequelize = app.app.get((await import('sequelize-typescript')).Sequelize);
      const espiao = jest.spyOn(sequelize, 'query');
      await publica().expect(200);
      const consultas = espiao.mock.calls.map(([q]) => String(q));
      espiao.mockRestore();
      const semTenant = consultas.filter((q) => !/tenant_id/.test(q));
      expect(semTenant).toEqual([]);
      expect(consultas.filter((q) => q.includes('codigo_publico'))).toHaveLength(1);
      expect(consultas.filter((q) => /FROM "produtos"/.test(q))[0]).toMatch(/"tenant_id" = '/);
      expect(consultas.filter((q) => /FROM "panfletos"/.test(q))[0]).toMatch(/"tenant_id" = '/);
    });
  });

  describe('Cenário: plano de execução usa os índices', () => {
    it('Então a consulta 1 usa filiais_codigo_publico_uk e a 3 usa produtos_filial_ativos_idx', async () => {
      const filiais = [filial];
      for (let i = 0; i < 4; i++) filiais.push(await criarFilial(app, lojista.token, { nome: `F${i}` }));
      for (const f of filiais) {
        const cat = await criarCategoria(app, lojista.token, f.id, `Cat ${f.id.slice(-4)}`);
        await sql(
          `INSERT INTO produtos (id, tenant_id, filial_id, categoria_id, nome, nome_normalizado,
                                 preco_promocional_centavos, data_inicio, data_limite)
           SELECT gen_random_uuid(), :t, :f, :c, 'P' || g, 'p' || g, 100 + g,
                  DATE '2026-09-01' + (g % 60), CASE WHEN g % 3 = 0 THEN NULL ELSE DATE '2026-10-10' + (g % 30) END
           FROM generate_series(1, 500) g`,
          { t: lojista.id, f: f.id, c: cat.id },
        );
      }
      // volume de produção para a tabela de filiais: com poucas linhas o seq scan é o certo
      await sql(
        `INSERT INTO filiais (id, tenant_id, nome, codigo_publico)
         SELECT gen_random_uuid(), :t, 'Filial ' || g, translate(lpad(g::text, 8, 'x'), '01', 'ab')
         FROM generate_series(1, 3000) g`,
        { t: lojista.id },
      );
      await sql('ANALYZE');
      const plano = async (q: string, r: Record<string, unknown>) =>
        ((await sql(`EXPLAIN ${q}`, r))[0] as Array<{ 'QUERY PLAN': string }>)
          .map((l) => l['QUERY PLAN'])
          .join('\n');

      const p1 = await plano(
        `SELECT f.id FROM filiais f JOIN lojistas l ON l.id = f.tenant_id
         JOIN lojista_ativacoes a ON a.lojista_id = l.id
         WHERE f.codigo_publico = :codigo AND f.deleted_at IS NULL LIMIT 1`,
        { codigo: filial.codigoPublico },
      );
      const p3 = await plano(
        `SELECT p.id FROM produtos p JOIN categorias c ON c.id = p.categoria_id AND c.deleted_at IS NULL
         WHERE p.tenant_id = :t AND p.filial_id = :f AND p.data_inicio <= '2026-10-18'
           AND (p.data_limite IS NULL OR p.data_limite >= '2026-10-18') AND p.deleted_at IS NULL`,
        { t: lojista.id, f: filial.id },
      );
      expect(p1).toContain('filiais_codigo_publico_uk');
      expect(p3).toContain('produtos_filial_ativos_idx');
    });
  });
});
