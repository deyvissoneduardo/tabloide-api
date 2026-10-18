import { AppError } from './app.error';
import { CodigoErro } from './codigos-erro';

export const naoEncontrado = () => new AppError(CodigoErro.RECURSO_NAO_ENCONTRADO);
export const naoAutenticado = () => new AppError(CodigoErro.NAO_AUTENTICADO);
export const credenciaisInvalidas = () => new AppError(CodigoErro.CREDENCIAIS_INVALIDAS);
export const validacaoInvalida = (detalhes?: Record<string, unknown>, mensagem?: string) =>
  new AppError(CodigoErro.VALIDACAO_INVALIDA, mensagem, detalhes);
