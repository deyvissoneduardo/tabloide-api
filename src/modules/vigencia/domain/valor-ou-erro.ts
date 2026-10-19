import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import type { ResultadoValidacao } from './vigencia.types';

/** Converte o resultado das regras puras de vigência em erro HTTP. Panfletos e produtos. */
export function valorOuErro<T>(resultado: ResultadoValidacao<T>): T {
  if (!resultado.ok) throw new AppError(CodigoErro[resultado.codigo], undefined, { campo: resultado.campo });
  return resultado.valor;
}
