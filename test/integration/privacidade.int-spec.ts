import { v7 as uuidv7 } from 'uuid';
import { VERSAO_TERMOS } from '../../src/modules/lojistas/domain/termos';
import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { umCadastroDeLojista, umLojista } from '../factories/lojista.factory';
import { ADMIN_KEY, AGORA_FIXO, criarApp, ipNovo, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, limparBanco, type BancoDeTeste } from '../helpers/banco-de-teste';

describe('Funcionalidade: LGPD e Marco Civil (aceite, registros de acesso, encerramento e exportação)', () => {
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

  const consultar = async (sql: string, id: string) =>
    (await banco.sequelize.query(sql, { replacements: { id } }))[0] as Array<Record<string, unknown>>;
  const corpoCadastro = (email: string) => ({
    ...umCadastroDeLojista().comEmail(email).build(),
    whatsapp: '(11) 98765-4321',
  });
  const admin = (metodo: 'get' | 'patch', caminho: string, chave?: string) => {
    const req = app.http()[metodo](`/v1/admin/lojistas/${caminho}`).set('X-Forwarded-For', ipNovo());
    return chave === undefined ? req : req.set('X-Admin-Key', chave);
  };

  describe('Cenário: cadastro sem aceite dos termos', () => {
    it('Então 400 VALIDACAO_INVALIDA e nada é gravado', async () => {
      const { aceiteTermos: _omitido, ...semAceite } = corpoCadastro('sem@aceite.com');
      const resposta = await app
        .http()
        .post('/v1/auth/cadastro')
        .set('X-Forwarded-For', ipNovo())
        .send(semAceite);
      expect(resposta.status).toBe(400);
      expect(resposta.body.erro.codigo).toBe('VALIDACAO_INVALIDA');
      expect(await consultar('SELECT id FROM lojistas WHERE email = :id', 'sem@aceite.com')).toEqual([]);
    });
  });

  describe('Cenário: cadastro com aceite', () => {
    it('Então grava a versão dos termos, o momento do aceite e o registro de acesso com o IP', async () => {
      const ip = ipNovo();
      const resposta = await app
        .http()
        .post('/v1/auth/cadastro')
        .set('X-Forwarded-For', ip)
        .send(corpoCadastro('com@aceite.com'))
        .expect(201);
      const id: string = resposta.body.lojista.id;

      expect(
        await consultar('SELECT termos_versao, termos_aceitos_em FROM lojistas WHERE id = :id', id),
      ).toEqual([{ termos_versao: VERSAO_TERMOS, termos_aceitos_em: AGORA_FIXO }]);
      expect(
        await consultar(
          'SELECT host(ip) AS ip, metodo, rota FROM registros_acesso_painel WHERE tenant_id = :id',
          id,
        ),
      ).toEqual([{ ip, metodo: 'POST', rota: '/v1/auth/cadastro' }]);
    });
  });

  describe('Cenário: requisição autenticada do painel', () => {
    it('Então gera registro de acesso sem a query string; a página pública não gera', async () => {
      const lojista = await umLojista().criar(app, banco.sequelize);
      await banco.sequelize.query('DELETE FROM registros_acesso_painel');
      const ip = ipNovo();
      await app
        .http()
        .get('/v1/painel/lojista?x=1')
        .set('X-Forwarded-For', ip)
        .set('Authorization', `Bearer ${lojista.token}`)
        .expect(200);
      await app.http().get('/v1/publico/filiais/k7Qm2xPa').set('X-Forwarded-For', ipNovo());

      expect(
        await consultar('SELECT host(ip) AS ip, metodo, rota FROM registros_acesso_painel', lojista.id),
      ).toEqual([{ ip, metodo: 'GET', rota: '/v1/painel/lojista' }]);
    });
  });

  describe('Cenário: encerramento sem a chave admin', () => {
    it('Então responde igual a uma rota inexistente', async () => {
      const r = await admin('patch', `${uuidv7()}/encerramento`);
      expect({ status: r.status, body: r.body }).toEqual(respostaRotaInexistente);
    });
  });

  describe('Cenário: encerramento de lojista inexistente', () => {
    it('Então 404', async () => {
      const r = await admin('patch', `${uuidv7()}/encerramento`, ADMIN_KEY);
      expect({ status: r.status, body: r.body }).toEqual(respostaRotaInexistente);
    });
  });

  describe('Cenário: encerramento com sucesso', () => {
    it('Então 204, a conta fica DESATIVADA com encerrado_em e o login passa a ser recusado', async () => {
      const lojista = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
      await admin('patch', `${lojista.id}/encerramento`, ADMIN_KEY).expect(204);

      expect(
        await consultar(
          `SELECT l.encerrado_em, a.status FROM lojistas l
           JOIN lojista_ativacoes a ON a.lojista_id = l.id WHERE l.id = :id`,
          lojista.id,
        ),
      ).toEqual([{ encerrado_em: AGORA_FIXO, status: 'DESATIVADO' }]);

      const login = await app
        .http()
        .post('/v1/auth/login')
        .set('X-Forwarded-For', ipNovo())
        .send({ email: lojista.email, senha: lojista.senha });
      expect(login.status).toBe(401);
      expect(login.body.erro.codigo).toBe('CREDENCIAIS_INVALIDAS');

      // idempotente
      await admin('patch', `${lojista.id}/encerramento`, ADMIN_KEY).expect(204);
    });
  });

  describe('Cenário: exportação dos dados sem a chave admin', () => {
    it('Então responde igual a uma rota inexistente', async () => {
      const r = await admin('get', `${uuidv7()}/dados`);
      expect({ status: r.status, body: r.body }).toEqual(respostaRotaInexistente);
    });
  });

  describe('Cenário: exportação dos dados', () => {
    it('Então devolve os dados do lojista, sem hash de senha nem dados de outro lojista', async () => {
      const lojista = await umLojista().criar(app, banco.sequelize);
      const outro = await umLojista().criar(app, banco.sequelize);

      const resposta = await admin('get', `${lojista.id}/dados`, ADMIN_KEY).expect(200);

      expect(resposta.body).toMatchObject({
        geradoEm: AGORA_FIXO.toISOString(),
        lojista: { id: lojista.id, email: lojista.email, termosVersao: VERSAO_TERMOS, logoUrl: null },
        filiais: [],
        produtos: [],
      });
      expect(resposta.body.registrosAcessoPainel.length).toBeGreaterThan(0);
      expect(resposta.text).not.toMatch(/senha|argon2/i);
      expect(resposta.text).not.toContain(outro.id);
    });
  });
});
