import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import type { PdfProcessado } from '../domain/pdf-processado';

/**
 * Lê o PDF do panfleto (RN13) sem regravar. Fica fora do p-limit do ImageProcessor: com até
 * 2 MB a leitura do pdf-lib é leve e não decodifica imagens.
 */
@Injectable()
export class PdfProcessor {
  private readonly logger = new Logger(PdfProcessor.name);

  async processar(entrada: Buffer, maxBytes: number): Promise<PdfProcessado> {
    if (entrada.length > maxBytes) throw new AppError(CodigoErro.PDF_MUITO_GRANDE, undefined, { maxBytes });
    const paginas = await this.contarPaginas(entrada);
    if (paginas.length !== 1) {
      throw new AppError(CodigoErro.PDF_COM_VARIAS_PAGINAS, undefined, { paginas: paginas.length });
    }
    const { width, height } = paginas[0]!;
    return {
      conteudo: entrada,
      largura: Math.round(width),
      altura: Math.round(height),
      contentType: 'application/pdf',
      bytes: entrada.length,
    };
  }

  /** PDF com senha lança EncryptedPDFError no load; o lixo só falha ao ler o catálogo, por isso tudo no try. */
  private async contarPaginas(entrada: Buffer): Promise<Array<{ width: number; height: number }>> {
    try {
      const documento = await PDFDocument.load(entrada, { updateMetadata: false });
      return documento.getPages().map((pagina) => pagina.getSize());
    } catch {
      this.logger.warn({ evento: 'midia.pdf_invalido', bytes: entrada.length });
      throw new AppError(CodigoErro.PDF_INVALIDO);
    }
  }
}
