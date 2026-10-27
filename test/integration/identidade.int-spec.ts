import { existsSync } from 'node:fs';
import path from 'node:path';
import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { umLojista } from '../factories/lojista.factory';
import { criarApp, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, type BancoDeTeste } from '../helpers/banco-de-teste';
import { imagens } from '../helpers/imagens';

describe('Funcionalidade: Identidade visual pela API (RN06)', () => {
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

  describe('Cenário: cores, nome e logo, só do próprio tenant', () => {
    it('Então só A muda e o logo fica sob o prefixo do tenant de A', async () => {
      const a = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
      const b = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
      const comoA = { Authorization: `Bearer ${a.token}` };

      const inicial = await app.http().get('/v1/painel/lojista/identidade').set(comoA).expect(200);
      expect(inicial.body).toEqual({
        nomeFantasia: 'Mercado Bom Preço',
        corPrimaria: null,
        corSecundaria: null,
        urlLogo: null,
        sePanfleto: false,
      });

      const editada = await app
        .http()
        .patch('/v1/painel/lojista/identidade')
        .set(comoA)
        .send({ corPrimaria: '#c8102e', corSecundaria: '#FFD100', nomeFantasia: ' Mercado A ' })
        .expect(200);
      expect(editada.body).toMatchObject({
        nomeFantasia: 'Mercado A',
        corPrimaria: '#C8102E',
        corSecundaria: '#FFD100',
      });

      const comLogo = await app
        .http()
        .put('/v1/painel/lojista/logo')
        .set(comoA)
        .attach('imagem', await imagens.pngComAlpha(1000, 1000), {
          filename: 'logo.png',
          contentType: 'image/png',
        })
        .expect(200);
      const caminho = String(comLogo.body.urlLogo).replace('http://localhost/v1/midia-local/', '');
      expect(caminho.startsWith(`${a.id}/logo/`)).toBe(true);
      expect(existsSync(path.join(app.midiaDir, caminho))).toBe(true);

      const deB = await app
        .http()
        .get('/v1/painel/lojista/identidade')
        .set({ Authorization: `Bearer ${b.token}` });
      expect(deB.body).toEqual({
        nomeFantasia: 'Mercado Bom Preço',
        corPrimaria: null,
        corSecundaria: null,
        urlLogo: null,
        sePanfleto: false,
      });
    });
  });

  describe('Funcionalidade: Chave "mostrar só o panfleto" (RN44)', () => {
    describe('Cenário: PATCH { sePanfleto: true } e GET devolvem sePanfleto true', () => {
      it('Então a chave fica ligada', async () => {
        const a = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
        const comoA = { Authorization: `Bearer ${a.token}` };
        const editada = await app
          .http()
          .patch('/v1/painel/lojista/identidade')
          .set(comoA)
          .send({ sePanfleto: true })
          .expect(200);
        expect(editada.body.sePanfleto).toBe(true);
        expect(
          (await app.http().get('/v1/painel/lojista/identidade').set(comoA).expect(200)).body.sePanfleto,
        ).toBe(true);
      });
    });

    describe('Cenário: lojista desativado muda a chave', () => {
      it('Então 403 LOJISTA_DESATIVADO', async () => {
        const a = await umLojista().comStatus(StatusLojista.DESATIVADO).criar(app, banco.sequelize);
        const r = await app
          .http()
          .patch('/v1/painel/lojista/identidade')
          .set({ Authorization: `Bearer ${a.token}` })
          .send({ sePanfleto: true })
          .expect(403);
        expect(r.body.erro.codigo).toBe('LOJISTA_DESATIVADO');
      });
    });
  });

  describe('Cenário: cor fora do formato no banco', () => {
    it('Então o CHECK recusa minúsculas mesmo sem a API', async () => {
      const a = await umLojista().criar(app, banco.sequelize);
      await expect(
        banco.sequelize.query(`UPDATE lojistas SET cor_primaria = '#c8102e' WHERE id = :id`, {
          replacements: { id: a.id },
        }),
      ).rejects.toMatchObject({ parent: { code: '23514' } });
    });
  });
});
