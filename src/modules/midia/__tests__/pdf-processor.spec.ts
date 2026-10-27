import { Logger } from '@nestjs/common';
import { pdfs } from '../../../../test/helpers/pdfs';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { PdfProcessor } from '../services/pdf-processor.service';

const DOIS_MB = 2 * 1024 * 1024;

describe('Funcionalidade: Leitura do PDF do panfleto (RN13)', () => {
  const processor = new PdfProcessor();
  let avisos: jest.SpyInstance;
  beforeEach(() => {
    avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => avisos.mockRestore());

  describe('Cenário: PDF de 1 página A4', () => {
    it('Então devolve o mesmo buffer, largura 595, altura 842, contentType application/pdf', async () => {
      const entrada = await pdfs.umaPagina();
      const resultado = await processor.processar(entrada, DOIS_MB);
      expect(resultado.conteudo).toBe(entrada);
      expect(resultado).toMatchObject({
        largura: 595,
        altura: 842,
        contentType: 'application/pdf',
        bytes: entrada.length,
      });
    });
  });

  describe('Cenário: tamanho em pontos fracionário é arredondado', () => {
    it('Então 595.3 x 841.6 vira 595 x 842', async () =>
      expect(await processor.processar(await pdfs.umaPagina(595.3, 841.6), DOIS_MB)).toMatchObject({
        largura: 595,
        altura: 842,
      }));
  });

  describe.each([
    [2, () => pdfs.paginas(2)],
    [0, () => pdfs.semPaginas()],
  ])('Cenário: %i páginas', (paginas, gerar) => {
    it(`Então PDF_COM_VARIAS_PAGINAS com detalhes.paginas = ${paginas}`, async () =>
      expect(processor.processar(await gerar(), DOIS_MB)).rejects.toMatchObject({
        codigo: CodigoErro.PDF_COM_VARIAS_PAGINAS,
        status: 422,
        detalhes: { paginas },
      }));
  });

  describe('Cenário: protegido por senha', () => {
    it('Então PDF_INVALIDO e o log não leva o conteúdo', async () => {
      await expect(processor.processar(await pdfs.protegido(), DOIS_MB)).rejects.toMatchObject({
        codigo: CodigoErro.PDF_INVALIDO,
      });
      expect(avisos).toHaveBeenCalledWith({ evento: 'midia.pdf_invalido', bytes: expect.any(Number) });
    });
  });

  describe('Cenário: corrompido', () => {
    it('Então PDF_INVALIDO', async () =>
      expect(processor.processar(pdfs.corrompido(), DOIS_MB)).rejects.toMatchObject({
        codigo: CodigoErro.PDF_INVALIDO,
      }));
  });

  describe('Cenário: acima de maxBytes', () => {
    it('Então PDF_MUITO_GRANDE com detalhes.maxBytes, sem tentar ler', async () => {
      const entrada = await pdfs.comTamanho(DOIS_MB + 1);
      expect(entrada.length).toBe(DOIS_MB + 1);
      await expect(processor.processar(entrada, DOIS_MB)).rejects.toMatchObject({
        codigo: CodigoErro.PDF_MUITO_GRANDE,
        status: 413,
        detalhes: { maxBytes: DOIS_MB },
      });
      expect(avisos).not.toHaveBeenCalled();
    });
  });
});
