import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { AuditoriaService } from '../../src/modules/auditoria/services/auditoria.service';
import { criarFilial } from '../factories/filial.factory';
import { umLojista, type LojistaCriado } from '../factories/lojista.factory';
import { criarApp, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, limparBanco, type BancoDeTeste } from '../helpers/banco-de-teste';

describe('Funcionalidade: Auditoria no banco real (RNF07)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let lojista: LojistaCriado;
  const sql = (q: string, replacements?: Record<string, unknown>) =>
    banco.sequelize.query(q, { replacements });
  const auth = (token = lojista.token) => ({ Authorization: `Bearer ${token}` });
  const editarFuso = (id: string, fusoHorario: string, token?: string) =>
    app.http().patch(`/v1/painel/filiais/${id}`).set(auth(token)).send({ fusoHorario });

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
  });
  beforeEach(async () => {
    lojista = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
  });
  afterEach(() => limparBanco(banco));
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  describe('Cenário: auditoria é append-only (D8)', () => {
    it('Então UPDATE e DELETE são recusados pelo banco', async () => {
      await criarFilial(app, lojista.token);
      await expect(sql(`UPDATE auditoria_alteracoes SET valor_novo = 'x'`)).rejects.toMatchObject({
        parent: { code: '42501' },
      });
      await expect(sql('DELETE FROM auditoria_alteracoes')).rejects.toMatchObject({
        parent: { code: '42501' },
      });
    });
  });

  describe('Cenário: auditoria participa da transação', () => {
    it('Então uma falha depois do registro desfaz a auditoria e a edição', async () => {
      const filial = await criarFilial(app, lojista.token);
      const auditoria = app.app.get(AuditoriaService);
      const original = auditoria.registrarAlteracoes.bind(auditoria);
      const espiao = jest
        .spyOn(auditoria, 'registrarAlteracoes')
        .mockImplementationOnce(async (...args: Parameters<AuditoriaService['registrarAlteracoes']>) => {
          await original(...args);
          throw new Error('rollback forçado');
        });

      await editarFuso(filial.id, 'America/Manaus').expect(500);
      espiao.mockRestore();

      const [linhas] = await sql('SELECT valor_novo FROM auditoria_alteracoes WHERE entidade_id = :id', {
        id: filial.id,
      });
      expect(linhas).toEqual([{ valor_novo: 'America/Sao_Paulo' }]);
      const atual = await app.http().get(`/v1/painel/filiais/${filial.id}`).set(auth());
      expect(atual.body.fusoHorario).toBe('America/Sao_Paulo');
    });
  });

  describe('Cenário: request_id é gravado', () => {
    it('Então a linha tem o X-Request-Id enviado', async () => {
      const filial = await criarFilial(app, lojista.token);
      await editarFuso(filial.id, 'America/Manaus').set('X-Request-Id', 'abc-123').expect(200);
      const [linhas] = await sql(
        `SELECT request_id FROM auditoria_alteracoes WHERE entidade_id = :id AND valor_anterior IS NOT NULL`,
        { id: filial.id },
      );
      expect(linhas).toEqual([{ request_id: 'abc-123' }]);
    });
  });

  describe('Cenário: consulta pela API', () => {
    it('Então devolve criação e edição, da mais recente para a mais antiga', async () => {
      const filial = await criarFilial(app, lojista.token);
      await editarFuso(filial.id, 'America/Manaus').expect(200);
      const resposta = await app
        .http()
        .get(`/v1/painel/auditoria?entidade=FILIAL&entidadeId=${filial.id}`)
        .set(auth())
        .expect(200);
      expect(resposta.body.total).toBe(2);
      expect(resposta.body.itens[0]).toMatchObject({
        valorAnterior: 'America/Sao_Paulo',
        valorNovo: 'America/Manaus',
      });
      expect(resposta.body.itens[0]).not.toHaveProperty('tenantId');
    });
  });

  describe('Cenário: isolamento da consulta de auditoria (RNF04)', () => {
    it('Então A consultando a filial de B recebe 200 com lista vazia', async () => {
      const b = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
      const filialB = await criarFilial(app, b.token);
      await editarFuso(filialB.id, 'America/Manaus', b.token).expect(200);

      const resposta = await app
        .http()
        .get(`/v1/painel/auditoria?entidade=FILIAL&entidadeId=${filialB.id}`)
        .set(auth())
        .expect(200);
      expect(resposta.body).toMatchObject({ itens: [], total: 0 });
    });
  });

  describe('Cenário: entidade inválida no banco', () => {
    it('Então "CATEGORIA" é recusada por auditoria_entidade_ck', () =>
      expect(
        sql(
          `INSERT INTO auditoria_alteracoes (id, tenant_id, entidade, entidade_id, campo, alterado_em)
           VALUES (gen_random_uuid(), :t, 'CATEGORIA', gen_random_uuid(), 'x', now())`,
          { t: lojista.id },
        ),
      ).rejects.toMatchObject({ parent: { constraint: 'auditoria_entidade_ck' } }));
  });
});
