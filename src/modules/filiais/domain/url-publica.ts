/** Endereço da página pública da filial, para onde o QR Code aponta (RN11, RN39). */
export function urlPublicaDaFilial(baseUrl: string, codigoPublico: string): string {
  return `${baseUrl}/f/${codigoPublico}`;
}
