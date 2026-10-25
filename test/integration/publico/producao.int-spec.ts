import { Sequelize } from 'sequelize-typescript';
import { DesligamentoService } from '../../../src/common/observabilidade/desligamento.service';
import { StatusLojista } from '../../../src/modules/lojistas/models/status-lojista';
import { criarCategoria } from '../../factories/categoria.factory';
import { umEnderecoDto } from '../../factories/endereco-filial.factory';
import { criarFilial, type FilialCriada } from '../../factories/filial.factory';
import { umLojista, type LojistaCriado } from '../../factories/lojista.factory';
import { inserirProduto } from '../../factories/produto.factory';
import { ADMIN_KEY, criarApp, ipNovo, type AppDeTeste } from '../../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, type BancoDeTeste } from '../../helpers/banco-de-teste';

const PAINEL = 'https://painel.tabloide.app';

describe('Funcionalidade: API pronta para produção', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let lojista: LojistaCriado;
  let filial: FilialCriada;
  const publica = (ip = ipNovo()) =>
    app.http().get(`/v1/publico/filiais/${filial.codigoPublico}`).set('X-Forwarded-For', ip);

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url, { CORS_ORIGENS_PAINEL: PAINEL });
    lojista = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    filial = await criarFilial(app, lojista.token);
    const categoria = await criarCategoria(app, lojista.token, filial.id, 'Mercearia');
    for (let i = 0; i < 20; i++) {
      await inserirProduto(banco.sequelize, {
        tenantId: lojista.id,
        filialId: filial.id,
        categoriaId: categoria.id,
        nome: `Produto com nome comprido número ${i}`,
        inicio: '2026-10-01',
        limite: null,
      });
    }
  });
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  describe('Funcionalidade: Hardening HTTP (RNF05)', () => {
    it('Cenário: headers de segurança e sem X-Powered-By', async () => {
      const r = await publica();
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['strict-transport-security']).toBeDefined();
      expect(r.headers['x-powered-by']).toBeUndefined();
    });

    it('Cenário: compressão gzip acima de 1 KB', async () => {
      const r = await publica().set('Accept-Encoding', 'gzip');
      expect(r.status).toBe(200);
      expect(r.headers['content-encoding']).toBe('gzip');
    });

    it('Cenário: corpo JSON acima de 100 KB no painel', async () => {
      const r = await app
        .http()
        .post('/v1/painel/filiais')
        .set('Authorization', `Bearer ${lojista.token}`)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ nome: 'x'.repeat(200 * 1024), endereco: umEnderecoDto() }));
      expect(r.status).toBe(413);
    });

    describe('Funcionalidade: CORS por rota', () => {
      const preflight = (caminho: string, origem: string, metodo = 'GET') =>
        app.http().options(caminho).set('Origin', origem).set('Access-Control-Request-Method', metodo);

      it('Cenário: painel só para a origem permitida, com credenciais', async () => {
        const ok = await preflight('/v1/painel/filiais', PAINEL, 'POST');
        expect(ok.headers['access-control-allow-origin']).toBe(PAINEL);
        expect(ok.headers['access-control-allow-credentials']).toBe('true');
        const ruim = await preflight('/v1/painel/filiais', 'https://malicioso.com', 'POST');
        expect(ruim.headers['access-control-allow-origin']).toBeUndefined();
      });

      it('Cenário: público aberto só para leitura e sem credenciais', async () => {
        const r = await preflight('/v1/publico/filiais/x', 'https://qualquer.site');
        expect(r.headers['access-control-allow-origin']).toBe('*');
        expect(r.headers['access-control-allow-methods']).toBe('GET,HEAD');
        expect(r.headers['access-control-allow-credentials']).toBeUndefined();
      });

      it('Cenário: admin e saúde sem CORS', async () => {
        for (const caminho of ['/v1/admin/metricas', '/v1/saude/pronto']) {
          const r = await preflight(caminho, PAINEL);
          expect(r.headers['access-control-allow-origin']).toBeUndefined();
        }
      });
    });
  });

  describe('Funcionalidade: Rate limit da rota pública', () => {
    it('Cenário: 300 por minuto por IP; a 301ª recebe 429, outro IP e o login seguem livres', async () => {
      const ip = ipNovo();
      for (let i = 0; i < 300; i++) expect((await publica(ip)).status).toBe(200);
      const excedida = await publica(ip);
      expect(excedida.status).toBe(429);
      expect(excedida.body.erro.codigo).toBe('MUITAS_TENTATIVAS');
      expect(excedida.headers['retry-after']).toBeDefined();

      expect((await publica(ipNovo())).status).toBe(200);
      const login = await app
        .http()
        .post('/v1/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: lojista.email, senha: lojista.senha });
      expect(login.status).toBe(200);
    });
  });

  describe('Funcionalidade: Health check', () => {
    it('Cenário: liveness', async () => {
      const r = await app.http().get('/v1/saude/vivo');
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ status: 'ok' });
    });

    it('Cenário: readiness com banco disponível', async () => {
      const r = await app.http().get('/v1/saude/pronto');
      expect(r.status).toBe(200);
      expect(r.body.info.banco.status).toBe('up');
    });

    it('Cenário: readiness com banco indisponível', async () => {
      const espiao = jest
        .spyOn(app.app.get(Sequelize), 'query')
        .mockRejectedValueOnce(new Error('fora do ar'));
      const r = await app.http().get('/v1/saude/pronto');
      espiao.mockRestore();
      expect(r.status).toBe(503);
      expect(r.body.info.banco.status).toBe('down');
    });

    it('Cenário: saúde não gera log de acesso nem passa pelo rate limit', async () => {
      const antes = app.logs.length;
      for (let i = 0; i < 50; i++) expect((await app.http().get('/v1/saude/vivo')).status).toBe(200);
      expect(app.logs.slice(antes).filter((l) => l.includes('/v1/saude'))).toEqual([]);
    });
  });

  describe('Funcionalidade: Logs e métricas', () => {
    it('Cenário: o token não aparece nos logs e o requestId recebido é devolvido', async () => {
      const antes = app.logs.length;
      const r = await app
        .http()
        .get('/v1/painel/filiais')
        .set('Authorization', `Bearer ${lojista.token}`)
        .set('X-Request-Id', 'abc-123');
      expect(r.headers['x-request-id']).toBe('abc-123');
      const linhas = app.logs.slice(antes).join('\n');
      expect(linhas).toContain('abc-123');
      expect(linhas).not.toContain(lojista.token);
    });

    it('Cenário: métricas exigem a chave de admin', async () => {
      const sem = await app.http().get('/v1/admin/metricas');
      expect(sem.status).toBe(404);
      expect(sem.body.erro.codigo).toBe('RECURSO_NAO_ENCONTRADO');

      await publica();
      const com = await app.http().get('/v1/admin/metricas').set('X-Admin-Key', ADMIN_KEY);
      expect(com.status).toBe(200);
      expect(com.text).toContain('http_request_duration_seconds');
      expect(com.text).toContain('publico_cache_total');
      expect(com.text).toContain('rota="/v1/publico/filiais/:codigo"');
      expect(com.text).toContain('db_pool_em_uso');
      expect(com.text).not.toContain(filial.codigoPublico);
    });
  });

  // por último: depois disso o app está "desligando"
  describe('Cenário: readiness durante o desligamento', () => {
    it('Então 503 mesmo com o banco disponível, e a liveness segue 200', async () => {
      await app.app.get(DesligamentoService).beforeApplicationShutdown();
      expect((await app.http().get('/v1/saude/pronto')).status).toBe(503);
      expect((await app.http().get('/v1/saude/vivo')).status).toBe(200);
    });
  });
});
