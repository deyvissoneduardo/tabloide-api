import { readdirSync } from 'node:fs';
import path from 'node:path';
import { encerrarBanco, iniciarBanco, limparBanco, type BancoDeTeste } from '../helpers/banco-de-teste';

const TOTAL_MIGRATIONS = readdirSync(path.resolve(__dirname, '../../src/database/migrations')).filter((f) =>
  f.endsWith('.js'),
).length;

describe('Funcionalidade: Migrations', () => {
  let banco: BancoDeTeste;
  const sql = (q: string, replacements?: Record<string, unknown>) =>
    banco.sequelize.query(q, { replacements });

  beforeAll(async () => {
    banco = await iniciarBanco();
  });
  afterEach(() => limparBanco(banco));
  afterAll(() => encerrarBanco(banco));

  const inserirLojista = (campos: Record<string, unknown> = {}) =>
    sql(
      `INSERT INTO lojistas (id, nome_fantasia, nome_responsavel, email, senha_hash, whatsapp, cnpj, cor_primaria)
       VALUES (gen_random_uuid(), 'M', 'R', :email, 'h', :whatsapp, :cnpj, :cor)`,
      { email: 'a@x.com', whatsapp: '+5511987654321', cnpj: null, cor: null, ...campos },
    );

  describe('Cenário: extensões', () => {
    it('Então citext e btree_gist existem', async () => {
      const [linhas] = await sql(
        `SELECT extname FROM pg_extension WHERE extname IN ('citext', 'btree_gist')`,
      );
      expect((linhas as { extname: string }[]).map((l) => l.extname).sort()).toEqual([
        'btree_gist',
        'citext',
      ]);
    });
  });

  describe('Cenário: CHECKs recusam valores inválidos inseridos via SQL', () => {
    it.each([
      ['WhatsApp sem +55', { whatsapp: '11987654321' }],
      ['WhatsApp com DDD 0', { whatsapp: '+5501987654321' }],
      ['CNPJ com letra', { cnpj: '1122233300018a' }],
      ['cor em minúsculas', { cor: '#ff0000' }],
      ['cor sem #', { cor: 'FF0000F' }],
    ])('Então %s é recusado', async (_nome, campos) => {
      await expect(inserirLojista(campos)).rejects.toMatchObject({ parent: { code: '23514' } });
    });

    it('E valores válidos são aceitos', () =>
      expect(inserirLojista({ cnpj: '11222333000181', cor: '#FF0000' })).resolves.toBeDefined());
  });

  describe('Cenário: UNIQUE(email) sem diferenciar maiúsculas (citext)', () => {
    it('Então ANA@X.COM é recusado depois de ana@x.com', async () => {
      await inserirLojista({ email: 'ana@x.com' });
      await expect(inserirLojista({ email: 'ANA@X.COM' })).rejects.toMatchObject({
        parent: { code: '23505', constraint: 'lojistas_email_key' },
      });
    });
  });

  describe('Cenário: ativação nasce aguardando e o trigger atualiza atualizado_em', () => {
    it('Então o default é AGUARDANDO_ATIVACAO e o UPDATE muda atualizado_em', async () => {
      await inserirLojista();
      await sql(`INSERT INTO lojista_ativacoes (lojista_id, atualizado_em)
                 SELECT id, now() - interval '1 day' FROM lojistas`);
      const [[antes]] = (await sql('SELECT status, atualizado_em FROM lojista_ativacoes')) as [
        { status: string; atualizado_em: Date }[],
        unknown,
      ];
      expect(antes!.status).toBe('AGUARDANDO_ATIVACAO');

      await sql(`UPDATE lojista_ativacoes SET status = 'ATIVO'`);
      const [[depois]] = (await sql('SELECT atualizado_em FROM lojista_ativacoes')) as [
        { atualizado_em: Date }[],
        unknown,
      ];
      expect(depois!.atualizado_em.getTime()).toBeGreaterThan(antes!.atualizado_em.getTime());
    });
  });

  describe('Cenário: reverter e reaplicar do zero', () => {
    it('Então undo:all reverte tudo e up reaplica sem erro', async () => {
      await banco.migrador.down({ to: 0 });
      const [tabelas] = await sql(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'lojista%'`,
      );
      expect(tabelas).toEqual([]);
      await expect(banco.migrador.up()).resolves.toHaveLength(TOTAL_MIGRATIONS);
    });
  });
});
