import { existsSync } from 'node:fs';
import path from 'node:path';
import { v7 as uuidv7 } from 'uuid';
import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { PaginaPublicaCache } from '../../src/modules/publico/services/pagina-publica.cache';
import { criarFilial, type FilialCriada } from '../factories/filial.factory';
import { umLojista, type LojistaCriado } from '../factories/lojista.factory';
import { AGORA_FIXO, criarApp, ipNovo, relogio, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, limparBanco, type BancoDeTeste } from '../helpers/banco-de-teste';
import { imagens } from '../helpers/imagens';

const ROTA = '/v1/painel/lojista/pagina';
const URL_MIDIA = 'http://localhost/v1/midia-local/';

const CORES_NULAS = {
  primaria: null,
  secundaria: null,
  texto: null,
  textoSuave: null,
  fundoCartao: null,
  fundoPagina: null,
  neutra: null,
  sobreCor: null,
  fundoBanner: null,
  categoria: null,
};

describe('Funcionalidade: Aparência da página pela API (RN46, RN47, RN48)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let lojista: LojistaCriado;
  let filial: FilialCriada;
  const auth = () => ({ Authorization: `Bearer ${lojista.token}` });
  const patch = (corpo: object) => app.http().patch(ROTA).set(auth()).send(corpo);
  const publica = (codigo = filial.codigoPublico) =>
    app.http().get(`/v1/publico/filiais/${codigo}`).set('X-Forwarded-For', ipNovo()).expect(200);
  const enviar = (caminho: 'logo' | 'foto', imagem: Buffer) =>
    app
      .http()
      .put(`${ROTA}/banner/${caminho}`)
      .set(auth())
      .attach('imagem', imagem, { filename: 'b.png', contentType: 'image/png' });
  const caminhoDaUrl = (url: string) => url.replace(URL_MIDIA, '');

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
  afterEach(() => limparBanco(banco));
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  describe('Cenário: lojista sem configuração', () => {
    it('Então o painel recebe tudo padrão e a página pública as cores de hoje, sem banner', async () => {
      const r = await app.http().get(ROTA).set(auth()).expect(200);
      expect(r.body).toEqual({
        banner: { exibir: false, nome: null, urlLogo: null, campanha: null },
        exibirNomeCategoria: true,
        cores: CORES_NULAS,
      });
      expect((await publica()).body.aparencia).toEqual({
        cores: {
          primaria: '#1565C0',
          secundaria: '#996B00',
          texto: '#1F1F1F',
          textoSuave: '#5C5C5C',
          fundoCartao: '#FFFFFF',
          fundoPagina: '#F3F4F6',
          neutra: '#EEEEEE',
          sobreCor: '#FFFFFF',
          fundoBanner: '#1565C0',
          categoria: '#1565C0',
        },
        exibirNomeCategoria: true,
        banner: null,
      });
    });
  });

  describe('Cenário: PATCH parcial', () => {
    it('Então grava só o enviado, normalizado, e os outros campos ficam', async () => {
      await patch({ cores: { primaria: '#c8102e' }, exibirNomeCategoria: false }).expect(200);
      const r = await patch({ banner: { exibir: true, nome: '  Semana  do Hortifrúti ' } }).expect(200);
      expect(r.body).toEqual({
        banner: { exibir: true, nome: 'Semana do Hortifrúti', urlLogo: null, campanha: null },
        exibirNomeCategoria: false,
        cores: { ...CORES_NULAS, primaria: '#C8102E' },
      });
      expect((await app.http().get(ROTA).set(auth()).expect(200)).body).toEqual(r.body);
    });
  });

  describe('Cenário: PATCH inválido', () => {
    it('Então 400 VALIDACAO_INVALIDA com o campo, sem mudar nada', async () => {
      const r = await patch({ cores: { texto: '#12345' } }).expect(400);
      expect(r.body.erro.codigo).toBe('VALIDACAO_INVALIDA');
      expect(r.body.erro.detalhes.campos).toHaveProperty(['cores.texto']);
      expect((await app.http().get(ROTA).set(auth())).body.cores).toEqual(CORES_NULAS);
    });
  });

  describe('Cenário: logo e foto do banner (upload real)', () => {
    it('Então ficam sob o prefixo do tenant, a foto substitui a descrição e a remoção só mexe no JSON', async () => {
      await patch({ banner: { exibir: true, descricao: 'Tudo fresco' } }).expect(200);

      const comLogo = await enviar('logo', await imagens.pngComAlpha(1000, 1000)).expect(200);
      const logo = caminhoDaUrl(comLogo.body.banner.urlLogo);
      expect(logo.startsWith(`${lojista.id}/logo/`)).toBe(true);
      expect(existsSync(path.join(app.midiaDir, logo))).toBe(true);
      expect(comLogo.body.banner.campanha).toEqual({ tipo: 'DESCRICAO', descricao: 'Tudo fresco' });

      const comFoto = await enviar('foto', await imagens.png(3200, 1800)).expect(200);
      expect(comFoto.body.banner.campanha.tipo).toBe('FOTO');
      const foto = caminhoDaUrl(comFoto.body.banner.campanha.urlFoto);
      expect(foto).toMatch(new RegExp(`^${lojista.id}/banner/.+\\.webp$`));
      expect(existsSync(path.join(app.midiaDir, foto))).toBe(true);

      const semFoto = await app.http().delete(`${ROTA}/banner/foto`).set(auth()).expect(200);
      expect(semFoto.body.banner.campanha).toBeNull();
      const semLogo = await app.http().delete(`${ROTA}/banner/logo`).set(auth()).expect(200);
      expect(semLogo.body.banner.urlLogo).toBeNull();
      // ADR 0011: nada é apagado do storage
      expect(existsSync(path.join(app.midiaDir, foto))).toBe(true);
      expect(existsSync(path.join(app.midiaDir, logo))).toBe(true);
    });
  });

  describe('Cenário: imagem inválida e acima do limite do lojista', () => {
    it('Então IMAGEM_INVALIDA e IMAGEM_MUITO_GRANDE, sem mudar a configuração', async () => {
      // antes de qualquer upload: o limite do lojista fica em cache depois da primeira leitura
      await banco.sequelize.query(
        `INSERT INTO lojista_limites (lojista_id, max_imagem_bytes) VALUES (:id, 1000)`,
        { replacements: { id: lojista.id } },
      );
      const invalida = await app
        .http()
        .put(`${ROTA}/banner/foto`)
        .set(auth())
        .attach('imagem', Buffer.from('não é imagem'), { filename: 'x.png', contentType: 'image/png' });
      expect(invalida.body.erro.codigo).toBe('IMAGEM_INVALIDA');

      const grande = await enviar('logo', await imagens.png(400, 400));
      expect(grande.status).toBe(413);
      expect(grande.body.erro.codigo).toBe('IMAGEM_MUITO_GRANDE');
      expect((await app.http().get(ROTA).set(auth())).body.banner).toEqual({
        exibir: false,
        nome: null,
        urlLogo: null,
        campanha: null,
      });
    });
  });

  describe('Cenário: a página pública de todas as filiais reflete a mudança (cache invalidado)', () => {
    it('Então aparencia muda nas duas filiais, sem path no JSON', async () => {
      const outra = await criarFilial(app, lojista.token, { nome: 'Bairro' });
      const antes = await publica();
      await publica(outra.codigoPublico);

      await enviar('logo', await imagens.png(300, 300)).expect(200);
      await patch({
        banner: { exibir: true, nome: 'Semana', descricao: 'Tudo fresco' },
        exibirNomeCategoria: false,
        cores: { fundoBanner: '#0B3D91', categoria: '#0B8043' },
      }).expect(200);

      for (const codigo of [filial.codigoPublico, outra.codigoPublico]) {
        const r = await publica(codigo);
        expect(r.headers.etag).not.toBe(antes.headers.etag);
        expect(r.body.aparencia).toMatchObject({
          exibirNomeCategoria: false,
          cores: { primaria: '#1565C0', fundoBanner: '#0B3D91', categoria: '#0B8043' },
          banner: { nome: 'Semana', campanha: { tipo: 'DESCRICAO', descricao: 'Tudo fresco' } },
        });
        expect(r.body.aparencia.banner.logoUrl).toMatch(new RegExp(`^${URL_MIDIA}${lojista.id}/logo/`));
        expect(r.text).not.toMatch(/Path"/);
      }
    });
  });

  describe('Cenário: banner ligado e panfleto em exibição (RN44)', () => {
    it('Então aparencia.banner é null', async () => {
      await banco.sequelize.query(
        `INSERT INTO panfletos (id, tenant_id, filial_id, imagem_path, imagem_largura, imagem_altura, data_inicio, data_limite)
         VALUES (:id, :t, :f, :caminho, 1600, 2263, '2026-10-01', NULL)`,
        {
          replacements: {
            id: uuidv7(),
            t: lojista.id,
            f: filial.id,
            caminho: `${lojista.id}/panfleto/p.webp`,
          },
        },
      );
      await patch({ banner: { exibir: true, nome: 'Semana' } }).expect(200);
      expect((await publica()).body.aparencia.banner).toEqual({ nome: 'Semana' });

      await app
        .http()
        .patch('/v1/painel/lojista/identidade')
        .set(auth())
        .send({ sePanfleto: true })
        .expect(200);
      const r = await publica();
      expect(r.body.panfleto).not.toBeNull();
      expect(r.body.aparencia.banner).toBeNull();
    });
  });

  describe('Funcionalidade: Identidade compatível (T3)', () => {
    it('Então a cor do Perfil aparece na aparência, e a da aparência no Perfil e na página', async () => {
      await app
        .http()
        .patch('/v1/painel/lojista/identidade')
        .set(auth())
        .send({ corPrimaria: '#c8102e' })
        .expect(200);
      expect((await app.http().get(ROTA).set(auth())).body.cores.primaria).toBe('#C8102E');

      await patch({ cores: { secundaria: '#FFD100' } }).expect(200);
      const identidade = await app.http().get('/v1/painel/lojista/identidade').set(auth()).expect(200);
      expect(identidade.body).toMatchObject({ corPrimaria: '#C8102E', corSecundaria: '#FFD100' });
      expect((await publica()).body.lojista).toMatchObject({
        corPrimaria: '#C8102E',
        corSecundaria: '#FFD100',
      });

      await app
        .http()
        .patch('/v1/painel/lojista/identidade')
        .set(auth())
        .send({ corPrimaria: null })
        .expect(200);
      expect((await app.http().get(ROTA).set(auth())).body.cores).toMatchObject({
        primaria: null,
        secundaria: '#FFD100',
      });
    });
  });

  describe('Cenário: lojista desativado', () => {
    it.each([
      ['PATCH', () => app.http().patch(ROTA).send({ exibirNomeCategoria: false })],
      ['DELETE logo', () => app.http().delete(`${ROTA}/banner/logo`)],
    ])('Então %s responde 403 LOJISTA_DESATIVADO', async (_rotulo, requisicao) => {
      const desativado = await umLojista().comStatus(StatusLojista.DESATIVADO).criar(app, banco.sequelize);
      const r = await requisicao().set({ Authorization: `Bearer ${desativado.token}` });
      expect(r.status).toBe(403);
      expect(r.body.erro.codigo).toBe('LOJISTA_DESATIVADO');
    });
  });
});
