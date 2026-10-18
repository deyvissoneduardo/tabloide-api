import { v7 as uuidv7 } from 'uuid';
import { umLojista } from '../factories/lojista.factory';
import { ADMIN_KEY, criarApp, ipNovo, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, limparBanco, type BancoDeTeste } from '../helpers/banco-de-teste';

describe('Funcionalidade: Redefinição de senha pelo administrador (RN36)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let respostaRotaInexistente: { status: number; body: unknown };

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
    const r = await app.http().get('/v1/rota-que-nao-existe');
    respostaRotaInexistente = { status: r.status, body: r.body };
  });
  afterEach(() => limparBanco(banco));
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  const redefinir = (id: string, corpo: object, chave?: string) => {
    const req = app.http().patch(`/v1/admin/lojistas/${id}/senha`).set('X-Forwarded-For', ipNovo());
    if (chave !== undefined) req.set('X-Admin-Key', chave);
    return req.send(corpo);
  };
  const esperaIgualRotaInexistente = (r: { status: number; body: unknown }) =>
    expect({ status: r.status, body: r.body }).toEqual(respostaRotaInexistente);

  describe('Cenário: sem chave', () => {
    it('Então responde igual a uma rota inexistente (404)', async () =>
      esperaIgualRotaInexistente(await redefinir(uuidv7(), { novaSenha: 'novaSenha123' })));
  });

  describe('Cenário: chave errada', () => {
    it('Então 404', async () =>
      esperaIgualRotaInexistente(await redefinir(uuidv7(), { novaSenha: 'novaSenha123' }, 'chave-errada')));
  });

  describe('Cenário: chave certa e lojista inexistente', () => {
    it('Então 404', async () =>
      esperaIgualRotaInexistente(await redefinir(uuidv7(), { novaSenha: 'novaSenha123' }, ADMIN_KEY)));
  });

  describe('Cenário: id que não é UUID v7', () => {
    it('Então 404, não 400', async () =>
      esperaIgualRotaInexistente(await redefinir('123', { novaSenha: 'novaSenha123' }, ADMIN_KEY)));
  });

  describe('Cenário: sem chave e corpo inválido', () => {
    it('Então 404, nunca 400', async () =>
      esperaIgualRotaInexistente(await redefinir('123', { novaSenha: 'x' })));
  });

  describe('Cenário: rota admin inexistente', () => {
    it('Então responde igual a sem chave', async () =>
      esperaIgualRotaInexistente(await app.http().get('/v1/admin/xyz').set('X-Admin-Key', ADMIN_KEY)));
  });

  describe('Cenário: chave certa e senha fraca', () => {
    it('Então 400 VALIDACAO_INVALIDA', async () => {
      const lojista = await umLojista().criar(app, banco.sequelize);
      const resposta = await redefinir(lojista.id, { novaSenha: 'fraca' }, ADMIN_KEY);
      expect(resposta.status).toBe(400);
      expect(resposta.body.erro.codigo).toBe('VALIDACAO_INVALIDA');
    });
  });

  describe('Cenário: sucesso', () => {
    it('Então 204, a senha antiga deixa de funcionar e a nova entra', async () => {
      const lojista = await umLojista().criar(app, banco.sequelize);
      await redefinir(lojista.id, { novaSenha: 'novaSenha123' }, ADMIN_KEY).expect(204);

      const ip = ipNovo();
      const login = (senha: string) =>
        app.http().post('/v1/auth/login').set('X-Forwarded-For', ip).send({ email: lojista.email, senha });
      await login(lojista.senha).expect(401);
      await login('novaSenha123').expect(200);
    });
  });
});
