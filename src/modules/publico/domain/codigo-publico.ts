/** Mesmo alfabeto do gerador da Fase 2 (sem 0 1 i l o I O), 8 caracteres (RN39). */
export const CODIGO_PUBLICO_REGEX = /^[23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

/** Formato inválido vira 404 sem tocar cache nem banco: barra varredura e lixo de scanners. */
export const codigoPublicoValido = (codigo: string): boolean => CODIGO_PUBLICO_REGEX.test(codigo);
