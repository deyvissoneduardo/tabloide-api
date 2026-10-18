import { ADMIN_KEY, criarApp, ipNovo, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, type BancoDeTeste } from '../helpers/banco-de-teste';
import { umLojista } from '../factories/lojista.factory';

describe('Funcionalidade: Contrato de erros e logs pela API', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
  });
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  describe('Cenário: rota inexistente', () => {
    it('Então 404 RECURSO_NAO_ENCONTRADO no formato padrão', async () => {
      const resposta = await app.http().get('/v1/nao-existe');
      expect(resposta.status).toBe(404);
      expect(resposta.body).toEqual({
        erro: { codigo: 'RECURSO_NAO_ENCONTRADO', mensagem: expect.any(String) },
      });
    });
  });

  describe('Cenário: JSON malformado', () => {
    it('Então 400 VALIDACAO_INVALIDA', async () => {
      const resposta = await app
        .http()
        .post('/v1/auth/login')
        .set('Content-Type', 'application/json')
        .set('X-Forwarded-For', ipNovo())
        .send('{"email": ');
      expect(resposta.status).toBe(400);
      expect(resposta.body.erro.codigo).toBe('VALIDACAO_INVALIDA');
    });
  });

  describe('Cenário: x-request-id', () => {
    it('Então toda resposta tem x-request-id', async () => {
      const ok = await app.http().post('/v1/auth/login').set('X-Forwarded-For', ipNovo()).send({});
      const erro = await app.http().get('/v1/nao-existe');
      expect(ok.headers['x-request-id']).toEqual(expect.any(String));
      expect(erro.headers['x-request-id']).toEqual(expect.any(String));
    });

    it('E o x-request-id recebido é propagado', async () => {
      const resposta = await app.http().get('/v1/nao-existe').set('x-request-id', 'meu-id-123');
      expect(resposta.headers['x-request-id']).toBe('meu-id-123');
    });
  });

  describe('Cenário: logs não contêm credenciais', () => {
    it('Então senha, token e chave admin não aparecem na saída do logger', async () => {
      const lojista = await umLojista().criar(app, banco.sequelize);
      await app.http().get('/v1/painel/lojista').set('Authorization', `Bearer ${lojista.token}`).expect(200);
      await app
        .http()
        .patch(`/v1/admin/lojistas/${lojista.id}/senha`)
        .set('X-Admin-Key', ADMIN_KEY)
        .set('X-Forwarded-For', ipNovo())
        .send({ novaSenha: 'senhaSecreta987' })
        .expect(204);

      const saida = app.logs.join('');
      expect(saida.length).toBeGreaterThan(0);
      expect(saida).toContain('admin.senha_redefinida');
      for (const segredo of [lojista.senha, lojista.token, ADMIN_KEY, 'senhaSecreta987']) {
        expect(saida).not.toContain(segredo);
      }
    });
  });
});
