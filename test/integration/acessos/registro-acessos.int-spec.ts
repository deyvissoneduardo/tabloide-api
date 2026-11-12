import { Sequelize } from 'sequelize-typescript';
import { MetricasService } from '../../../src/common/observabilidade/metricas.service';
import { StatusLojista } from '../../../src/modules/lojistas/models/status-lojista';
import { PaginaPublicaCache } from '../../../src/modules/publico/services/pagina-publica.cache';
import { lerAcessos } from '../../factories/acesso-filial.factory';
import { criarFilial, type FilialCriada } from '../../factories/filial.factory';
import { definirStatus, umLojista, type LojistaCriado } from '../../factories/lojista.factory';
import { AGORA_FIXO, criarApp, ipNovo, relogio, type AppDeTeste } from '../../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, limparBanco, type BancoDeTeste } from '../../helpers/banco-de-teste';

const CELULAR =
  'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

/** Relógio padrão: 2026-10-18T12:00Z = 09h de 18/10 em São Paulo. */
describe('Funcionalidade: contar acessos à página pública (RN50–RN52)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let lojista: LojistaCriado;
  let filial: FilialCriada;

  const pagina = (codigo = filial.codigoPublico) =>
    app.http().get(`/v1/publico/filiais/${codigo}`).set('X-Forwarded-For', ipNovo());
  const acessos = (filialId = filial.id) => lerAcessos(banco.sequelize, filialId);

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
  });
  beforeEach(async () => {
    relogio.agora = AGORA_FIXO;
    app.app.get(PaginaPublicaCache).limpar();
    lojista = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    filial = await criarFilial(app, lojista.token, { nome: 'Centro' });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await limparBanco(banco);
  });
  afterAll(async () => {
    relogio.agora = AGORA_FIXO;
    await app?.fechar();
    await encerrarBanco(banco);
  });

  describe('Cenário: celular abre a página', () => {
    it('Dado um 200 com UA de celular, então grava (filial, data local, hora local, 1)', async () => {
      await pagina().set('User-Agent', CELULAR).expect(200);
      expect(await acessos()).toEqual([{ data: '2026-10-18', hora: 9, quantidade: 1 }]);
    });

    it('E um segundo acesso na mesma hora soma na mesma linha', async () => {
      await pagina().set('User-Agent', CELULAR).expect(200);
      await pagina().set('User-Agent', CELULAR).expect(200);
      expect(await acessos()).toEqual([{ data: '2026-10-18', hora: 9, quantidade: 2 }]);
    });

    it('E o 304 (If-None-Match) também conta', async () => {
      const primeira = await pagina().set('User-Agent', CELULAR).expect(200);
      await pagina()
        .set('User-Agent', CELULAR)
        .set('If-None-Match', String(primeira.headers.etag))
        .expect(304);
      expect(await acessos()).toEqual([{ data: '2026-10-18', hora: 9, quantidade: 2 }]);
    });

    it('E a resposta não muda: sem campos de acesso, mesmo Cache-Control', async () => {
      const r = await pagina().set('User-Agent', CELULAR).query({ origem: 'qr' }).expect(200);
      expect(r.headers['cache-control']).toBe('public, max-age=30, stale-while-revalidate=300');
      expect(JSON.stringify(r.body)).not.toMatch(/acesso|tenantId/i);
      expect(await acessos()).toHaveLength(1);
    });
  });

  describe('Esquema do Cenário: o que não conta', () => {
    it.each([
      [
        'HEAD',
        () => app.http().head(`/v1/publico/filiais/${filial.codigoPublico}`).set('User-Agent', CELULAR),
      ],
      ['UA vazio', () => pagina().set('User-Agent', '')],
      ['UA do WhatsApp', () => pagina().set('User-Agent', 'WhatsApp/2.23.20.0 A')],
      ['?origem=painel', () => pagina().set('User-Agent', CELULAR).query({ origem: 'painel' })],
    ])('Dado %s, então responde 200 e não grava', async (_nome, requisicao) => {
      expect((await requisicao()).status).toBe(200);
      expect(await acessos()).toEqual([]);
    });
  });

  describe('Cenário: 404 não conta (RN35)', () => {
    it('Dado código inexistente ou lojista desativado, então nada é gravado', async () => {
      await pagina('zzzzzzzz').set('User-Agent', CELULAR).expect(404);
      await definirStatus(banco.sequelize, lojista.id, StatusLojista.DESATIVADO);
      app.app.get(PaginaPublicaCache).limpar();
      await pagina().set('User-Agent', CELULAR).expect(404);
      const [linhas] = await banco.sequelize.query('SELECT 1 FROM acessos_filial');
      expect(linhas).toEqual([]);
    });
  });

  describe('Cenário: data e hora no fuso da filial (RN53)', () => {
    it('Dado filial em Manaus às 00:30 de Brasília, então grava 23h do dia anterior', async () => {
      const manaus = await criarFilial(app, lojista.token, { nome: 'Manaus', fusoHorario: 'America/Manaus' });
      relogio.agora = new Date('2026-10-19T03:30:00Z');
      await pagina(manaus.codigoPublico).set('User-Agent', CELULAR).expect(200);
      expect(await acessos(manaus.id)).toEqual([{ data: '2026-10-18', hora: 23, quantidade: 1 }]);
    });
  });

  describe('Cenário: banco de acessos indisponível (D5)', () => {
    it('Então a página responde 200 igual e a falha vira métrica', async () => {
      const sequelize = app.app.get(Sequelize);
      const original = sequelize.query.bind(sequelize);
      jest
        .spyOn(sequelize, 'query')
        .mockImplementation(((sql: unknown, opcoes: unknown) =>
          String(sql).includes('acessos_filial')
            ? Promise.reject(new Error('banco fora'))
            : original(sql as string, opcoes as never)) as typeof sequelize.query);
      const metricas = app.app.get(MetricasService);
      const antes =
        (await metricas.acessosFalhas.get()).values.find((v) => v.labels.motivo === 'erro')?.value ?? 0;

      const r = await pagina().set('User-Agent', CELULAR).expect(200);
      expect(r.body.filial.nome).toBe('Centro');

      const depois = (await metricas.acessosFalhas.get()).values.find(
        (v) => v.labels.motivo === 'erro',
      )?.value;
      expect(depois).toBe(antes + 1);
      jest.restoreAllMocks();
      expect(await acessos()).toEqual([]);
    });
  });
});
