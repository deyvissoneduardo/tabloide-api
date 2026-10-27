import type { ImagemProcessada } from './imagem-processada';

/** RN13: o PDF do panfleto é guardado como veio; só é lido para contar páginas e medir a página 1. */
export interface PdfProcessado {
  conteudo: Buffer;
  /** Pontos (1/72") da página 1, arredondados. */
  largura: number;
  altura: number;
  contentType: 'application/pdf';
  bytes: number;
}

export type ArquivoProcessado = ImagemProcessada | PdfProcessado;
