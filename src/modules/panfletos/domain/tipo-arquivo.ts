/** RN13: o panfleto é uma imagem (WebP processado) ou um PDF de 1 página. */
export const TIPOS_ARQUIVO_PANFLETO = ['IMAGEM', 'PDF'] as const;
export type TipoArquivoPanfleto = (typeof TIPOS_ARQUIVO_PANFLETO)[number];

/** O contentType já veio dos magic bytes (MidiaService.processarPanfleto). */
export function tipoArquivo(arquivo: { contentType: string }): TipoArquivoPanfleto {
  return arquivo.contentType === 'application/pdf' ? 'PDF' : 'IMAGEM';
}
