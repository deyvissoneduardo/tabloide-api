import { Transform } from 'class-transformer';
import { normalizarCnpj, normalizarEmail, normalizarEspacos, normalizarWhatsappBr } from '../utils/text';

const seTexto = (fn: (v: string) => unknown) =>
  Transform(({ value }) => (typeof value === 'string' ? fn(value) : value));

export const NormalizarEspacos = () => seTexto(normalizarEspacos);
export const NormalizarEmail = () => seTexto(normalizarEmail);
export const NormalizarWhatsapp = () => seTexto((v) => normalizarWhatsappBr(v) ?? v);
export const NormalizarCnpj = () => seTexto((v) => (v.trim() === '' ? null : (normalizarCnpj(v) ?? v)));

/**
 * Apara e colapsa espaços; texto vazio vira `vazio` (undefined no cadastro, null na edição,
 * em que null limpa o campo). Usado em campos opcionais que chegam por JSON ou multipart.
 */
export const TextoOpcional = (vazio: undefined | null = undefined) =>
  seTexto((v) => {
    const normalizado = normalizarEspacos(v);
    return normalizado === '' ? vazio : normalizado;
  });

/** Multipart só tem texto: "1299" vira 1299. "12.5", "abc" e "" seguem como texto e caem no @IsInt. */
export const InteiroDeFormulario = () => seTexto((v) => (/^-?\d+$/.test(v.trim()) ? Number(v) : v));
