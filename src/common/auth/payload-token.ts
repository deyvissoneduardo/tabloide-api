export const TIPO_TOKEN_LOJISTA = 'lojista';

export interface PayloadToken {
  sub: string;
  typ: typeof TIPO_TOKEN_LOJISTA;
  iat: number;
}
