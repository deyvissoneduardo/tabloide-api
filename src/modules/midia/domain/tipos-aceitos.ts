/** Só os magic bytes valem; o Content-Type declarado pelo cliente é ignorado (RNF05). HEIC fica fora do MVP (D3.1). */
export const TIPOS_IMAGEM_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** RN13: o panfleto aceita também PDF de 1 página. */
export const TIPOS_PANFLETO_ACEITOS = [...TIPOS_IMAGEM_ACEITOS, 'application/pdf'] as const;

export function ehTipoAceito(mime: string | undefined): boolean {
  return mime !== undefined && (TIPOS_IMAGEM_ACEITOS as readonly string[]).includes(mime);
}
