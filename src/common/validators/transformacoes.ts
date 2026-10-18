import { Transform } from 'class-transformer';
import { normalizarCnpj, normalizarEmail, normalizarEspacos, normalizarWhatsappBr } from '../utils/text';

const seTexto = (fn: (v: string) => unknown) =>
  Transform(({ value }) => (typeof value === 'string' ? fn(value) : value));

export const NormalizarEspacos = () => seTexto(normalizarEspacos);
export const NormalizarEmail = () => seTexto(normalizarEmail);
export const NormalizarWhatsapp = () => seTexto((v) => normalizarWhatsappBr(v) ?? v);
export const NormalizarCnpj = () => seTexto((v) => (v.trim() === '' ? null : (normalizarCnpj(v) ?? v)));
