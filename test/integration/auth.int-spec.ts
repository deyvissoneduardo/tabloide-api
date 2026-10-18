import { umCadastroDeLojista } from '../factories/lojista.factory';
import { criarApp, ipNovo, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, limparBanco, type BancoDeTeste } from '../helpers/banco-de-teste';

describe('Funcionalidade: Cadastro e login (RN01, RN02, RN05, RN37, RNF05)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
  });
  afterEach(() => limparBanco(banco));
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  const corpoCadastro = (email = 'ana@bompreco.com.br') => ({
    ...umCadastroDeLojista().comEmail(email).build(),
    whatsapp: '(11) 98765-4321',
    cnpj: '',
  });
  const cadastrar = (corpo: object, ip = ipNovo()) =>
    app.http().post('/v1/auth/cadastro').set('X-Forwarded-For', ip).send(corpo);
  const login = (corpo: object, ip: string) =>
    app.http().post('/v1/auth/login').set('X-Forwarded-For', ip).send(corpo);

  describe('Cenário: cadastro com sucesso', () => {
    it('Então 201 com token, status AGUARDANDO_ATIVACAO e a linha de ativação criada', async () => {
      const resposta = await cadastrar({ ...corpoCadastro(), email: ' Ana@BomPreco.com.br ' });
      expect(resposta.status).toBe(201);
      expect(resposta.body).toMatchObject({
        lojista: {
          email: 'ana@bompreco.com.br',
          whatsapp: '+5511987654321',
          cnpj: null,
          status: 'AGUARDANDO_ATIVACAO',
        },
        token: expect.any(String),
        expiraEm: '2026-10-18T20:00:00.000Z',
      });
      const [linhas] = await banco.sequelize.query(
        'SELECT status FROM lojista_ativacoes WHERE lojista_id = :id',
        {
          replacements: { id: resposta.body.lojista.id },
        },
      );
      expect(linhas).toEqual([{ status: 'AGUARDANDO_ATIVACAO' }]);
    });
  });

  describe('Cenário: e-mail duplicado com caixa diferente', () => {
    it('Então 409 EMAIL_JA_CADASTRADO', async () => {
      await cadastrar(corpoCadastro('ana@x.com')).expect(201);
      const resposta = await cadastrar(corpoCadastro('ANA@X.COM'));
      expect(resposta.status).toBe(409);
      expect(resposta.body.erro.codigo).toBe('EMAIL_JA_CADASTRADO');
    });
  });

  describe('Cenário: cadastros simultâneos com o mesmo e-mail', () => {
    it('Então um recebe 201 e o outro 409', async () => {
      const respostas = await Promise.all([
        cadastrar(corpoCadastro('mesmo@x.com')),
        cadastrar(corpoCadastro('mesmo@x.com')),
      ]);
      expect(respostas.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(respostas.find((r) => r.status === 409)!.body.erro.codigo).toBe('EMAIL_JA_CADASTRADO');
    });
  });

  describe('Cenário: cadastro inválido', () => {
    it('Então 400 VALIDACAO_INVALIDA com os campos', async () => {
      const resposta = await cadastrar({ ...corpoCadastro(), whatsapp: '123', senha: 'fraca' });
      expect(resposta.status).toBe(400);
      expect(Object.keys(resposta.body.erro.detalhes.campos).sort()).toEqual(['senha', 'whatsapp']);
    });
  });

  describe('Cenário: login correto e incorreto', () => {
    it('Então 200 com a senha certa e 401 CREDENCIAIS_INVALIDAS com a errada', async () => {
      await cadastrar(corpoCadastro('login@x.com')).expect(201);
      const ip = ipNovo();
      const certo = await login({ email: 'LOGIN@x.com', senha: 'senhaForte1' }, ip);
      expect(certo.status).toBe(200);
      expect(certo.body.token).toEqual(expect.any(String));

      const errado = await login({ email: 'login@x.com', senha: 'senhaErrada1' }, ip);
      expect(errado.status).toBe(401);
      expect(errado.body.erro.codigo).toBe('CREDENCIAIS_INVALIDAS');
    });
  });

  describe('Cenário: e-mail inexistente', () => {
    it('Então 401 com a mesma mensagem da senha errada', async () => {
      await cadastrar(corpoCadastro('existe@x.com')).expect(201);
      const ip = ipNovo();
      const semEmail = await login({ email: 'naoexiste@x.com', senha: 'senhaForte1' }, ip);
      const senhaErrada = await login({ email: 'existe@x.com', senha: 'outra1234' }, ip);
      expect(semEmail.status).toBe(401);
      expect(semEmail.body).toEqual(senhaErrada.body);
    });
  });

  describe('Cenário: excesso de tentativas de login', () => {
    it('Então a 6ª tentativa recebe 429 MUITAS_TENTATIVAS com Retry-After', async () => {
      const ip = ipNovo();
      for (let i = 0; i < 5; i += 1) await login({ email: 'alvo@x.com', senha: 'errada123' }, ip).expect(401);
      const sexta = await login({ email: 'alvo@x.com', senha: 'errada123' }, ip);
      expect(sexta.status).toBe(429);
      expect(sexta.body.erro.codigo).toBe('MUITAS_TENTATIVAS');
      expect(sexta.headers['retry-after']).toBeDefined();
    });

    it('E tentativas com outro e-mail no mesmo IP não somam', async () => {
      const ip = ipNovo();
      for (let i = 0; i < 5; i += 1) await login({ email: 'um@x.com', senha: 'errada123' }, ip).expect(401);
      await login({ email: 'outro@x.com', senha: 'errada123' }, ip).expect(401);
    });
  });

  describe('Cenário: respostas nunca expõem o hash', () => {
    it('Então nem cadastro nem login contêm senhaHash ou argon2', async () => {
      const cadastro = await cadastrar(corpoCadastro('hash@x.com'));
      const entrada = await login({ email: 'hash@x.com', senha: 'senhaForte1' }, ipNovo());
      for (const corpo of [cadastro.text, entrada.text]) {
        expect(corpo).not.toContain('senhaHash');
        expect(corpo).not.toContain('argon2');
      }
    });
  });
});
