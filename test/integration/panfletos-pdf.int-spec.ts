import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { criarFilial, type FilialCriada } from '../factories/filial.factory';
import { umLojista, type LojistaCriado } from '../factories/lojista.factory';
import { criarPanfleto, enviarPanfleto } from '../factories/panfleto.factory';
import { criarApp, ipNovo, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, limparBanco, type BancoDeTeste } from '../helpers/banco-de-teste';
import { pdfs } from '../helpers/pdfs';

const URL_MIDIA = 'http://localhost/v1/midia-local/';
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Relógio dos testes de integração: hoje = 2026-10-18 em São Paulo. */
describe('Funcionalidade: Upload de PDF no panfleto pelo HTTP (RN13)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let lojista: LojistaCriado;
  let filial: FilialCriada;
  const auth = () => ({ Authorization: `Bearer ${lojista.token}` });
  const enviarPdf = (pdf: Buffer, datas: { dataInicio?: string; dataLimite?: string } = {}) =>
    enviarPanfleto(app, lojista.token, filial.id, datas, pdf);

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
  });
  beforeEach(async () => {
    lojista = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    filial = await criarFilial(app, lojista.token);
  });
  afterEach(() => limparBanco(banco));
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  describe('Cenário: POST multipart com PDF de 1 página', () => {
    it('Então 201, tipo PDF, urlArquivo .pdf igual a urlImagem e tamanho em pontos', async () => {
      const r = await enviarPdf(await pdfs.umaPagina());
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ tipo: 'PDF', largura: 595, altura: 842 });
      expect(r.body.urlArquivo).toMatch(/\.pdf$/);
      expect(r.body.urlImagem).toBe(r.body.urlArquivo);
    });
  });

  describe('Cenário: o arquivo gravado no storage é idêntico ao enviado', () => {
    it('Então o hash é o mesmo', async () => {
      const pdf = await pdfs.umaPagina();
      const r = await enviarPdf(pdf);
      const gravado = readFileSync(path.join(app.midiaDir, String(r.body.urlArquivo).replace(URL_MIDIA, '')));
      expect(hash(gravado)).toBe(hash(pdf));
    });
  });

  describe('Cenário: PUT /imagem com PDF num panfleto de imagem', () => {
    it('Então 200 e tipo PDF', async () => {
      const { id } = await criarPanfleto(app, lojista.token, filial.id);
      const r = await app
        .http()
        .put(`/v1/painel/filiais/${filial.id}/panfletos/${id}/imagem`)
        .set(auth())
        .attach('imagem', await pdfs.umaPagina(), { filename: 'p.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(200);
      expect(r.body.tipo).toBe('PDF');
    });
  });

  describe('Cenário: PDF de 2 páginas', () => {
    it('Então 422 PDF_COM_VARIAS_PAGINAS com detalhes.paginas', async () => {
      const r = await enviarPdf(await pdfs.paginas(2));
      expect(r.status).toBe(422);
      expect(r.body.erro).toMatchObject({ codigo: 'PDF_COM_VARIAS_PAGINAS', detalhes: { paginas: 2 } });
    });
  });

  describe('Cenário: PDF de 2,5 MB', () => {
    it('Então 413 PDF_MUITO_GRANDE com detalhes.maxBytes 2097152', async () => {
      const r = await enviarPdf(await pdfs.comTamanho(2.5 * 1024 * 1024));
      expect(r.status).toBe(413);
      expect(r.body.erro).toMatchObject({ codigo: 'PDF_MUITO_GRANDE', detalhes: { maxBytes: 2097152 } });
    });
  });

  describe('Cenário: PDF protegido', () => {
    it('Então 422 PDF_INVALIDO', async () => {
      const r = await enviarPdf(await pdfs.protegido());
      expect(r.status).toBe(422);
      expect(r.body.erro.codigo).toBe('PDF_INVALIDO');
    });
  });

  describe('Cenário: plano com max_imagem_bytes de 1 MB e PDF de 1,5 MB', () => {
    it('Então 413 PDF_MUITO_GRANDE com maxBytes 1048576', async () => {
      await banco.sequelize.query(
        `INSERT INTO lojista_limites (lojista_id, max_filiais, max_produtos_por_filial, max_imagem_bytes)
         VALUES (:id, NULL, NULL, 1048576)`,
        { replacements: { id: lojista.id } },
      );
      const r = await enviarPdf(await pdfs.comTamanho(1.5 * 1024 * 1024));
      expect(r.status).toBe(413);
      expect(r.body.erro).toMatchObject({ codigo: 'PDF_MUITO_GRANDE', detalhes: { maxBytes: 1048576 } });
    });
  });

  describe('Cenário: a página pública com sePanfleto mostra o PDF', () => {
    it('Então panfleto.tipo PDF e arquivoUrl .pdf', async () => {
      expect((await enviarPdf(await pdfs.umaPagina())).status).toBe(201);
      await app
        .http()
        .patch('/v1/painel/lojista/identidade')
        .set(auth())
        .send({ sePanfleto: true })
        .expect(200);
      const r = await app
        .http()
        .get(`/v1/publico/filiais/${filial.codigoPublico}`)
        .set('X-Forwarded-For', ipNovo())
        .expect(200);
      expect(r.body.panfleto).toMatchObject({ tipo: 'PDF', largura: 595, altura: 842 });
      expect(r.body.panfleto.arquivoUrl).toMatch(/\.pdf$/);
      expect(r.body.estrutura.categorias).toEqual([]);
    });
  });
});
