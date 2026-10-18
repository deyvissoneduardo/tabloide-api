import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { definirStatus, umLojista } from '../factories/lojista.factory';
import { criarApp, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, limparBanco, type BancoDeTeste } from '../helpers/banco-de-teste';

describe('Funcionalidade: Dados do lojista no painel (RN01, RN08)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;

  beforeAll(async () => {
    banco = await iniciarBanco();
    // TTL 0: a mudança de status feita no banco vale na hora
    app = await criarApp(banco.url, { TENANT_STATUS_CACHE_TTL_MS: '0' });
  });
  afterEach(() => limparBanco(banco));
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  const comToken = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('Cenário: GET sem token', () => {
    it('Então 401 NAO_AUTENTICADO', async () => {
      const resposta = await app.http().get('/v1/painel/lojista');
      expect(resposta.status).toBe(401);
      expect(resposta.body.erro.codigo).toBe('NAO_AUTENTICADO');
    });
  });

  describe('Cenário: GET com token', () => {
    it('Então 200 com os dados do lojista', async () => {
      const lojista = await umLojista().criar(app, banco.sequelize);
      const resposta = await app.http().get('/v1/painel/lojista').set(comToken(lojista.token));
      expect(resposta.status).toBe(200);
      expect(resposta.body).toMatchObject({
        id: lojista.id,
        email: lojista.email,
        status: 'AGUARDANDO_ATIVACAO',
      });
    });
  });

  describe('Cenário: PATCH válido', () => {
    it('Então 200 e os dados ficam gravados', async () => {
      const lojista = await umLojista().criar(app, banco.sequelize);
      await app
        .http()
        .patch('/v1/painel/lojista')
        .set(comToken(lojista.token))
        .send({ nomeFantasia: 'Mercado Centro', cnpj: '11.222.333/0001-81' })
        .expect(200);
      const resposta = await app.http().get('/v1/painel/lojista').set(comToken(lojista.token));
      expect(resposta.body).toMatchObject({ nomeFantasia: 'Mercado Centro', cnpj: '11222333000181' });
    });
  });

  describe('Cenário: PATCH com e-mail', () => {
    it('Então 400 VALIDACAO_INVALIDA', async () => {
      const lojista = await umLojista().criar(app, banco.sequelize);
      const resposta = await app
        .http()
        .patch('/v1/painel/lojista')
        .set(comToken(lojista.token))
        .send({ email: 'novo@x.com' });
      expect(resposta.status).toBe(400);
      expect(resposta.body.erro.codigo).toBe('VALIDACAO_INVALIDA');
    });
  });

  describe('Cenário: lojista desativado e depois reativado (RN08)', () => {
    it('Então desativado lê mas não escreve, e reativado volta a escrever com os dados intactos', async () => {
      const lojista = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
      await definirStatus(banco.sequelize, lojista.id, StatusLojista.DESATIVADO);

      await app.http().get('/v1/painel/lojista').set(comToken(lojista.token)).expect(200);
      const bloqueado = await app
        .http()
        .patch('/v1/painel/lojista')
        .set(comToken(lojista.token))
        .send({ nomeFantasia: 'Tentativa' });
      expect(bloqueado.status).toBe(403);
      expect(bloqueado.body.erro.codigo).toBe('LOJISTA_DESATIVADO');

      await definirStatus(banco.sequelize, lojista.id, StatusLojista.ATIVO);
      const reativado = await app
        .http()
        .patch('/v1/painel/lojista')
        .set(comToken(lojista.token))
        .send({ nomeResponsavel: 'Bruno' });
      expect(reativado.status).toBe(200);
      expect(reativado.body).toMatchObject({
        nomeFantasia: 'Mercado Bom Preço',
        nomeResponsavel: 'Bruno',
        status: 'ATIVO',
      });
    });
  });
});
