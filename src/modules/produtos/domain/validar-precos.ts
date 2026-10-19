import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';

/** RN21: o preço original, quando informado, precisa ser maior que o promocional. Valores em centavos. */
export function validarPrecos(promocional: number, original: number | null): void {
  if (!Number.isInteger(promocional) || promocional <= 0) {
    throw new AppError(
      CodigoErro.VALIDACAO_INVALIDA,
      'O preço promocional precisa ser um inteiro positivo.',
      {
        campo: 'precoPromocionalCentavos',
      },
    );
  }
  if (original === null) return;
  if (!Number.isInteger(original)) {
    throw new AppError(CodigoErro.VALIDACAO_INVALIDA, 'O preço original precisa ser um inteiro.', {
      campo: 'precoOriginalCentavos',
    });
  }
  if (original <= promocional) {
    throw new AppError(CodigoErro.PRECO_ORIGINAL_INVALIDO, undefined, {
      precoPromocionalCentavos: promocional,
      precoOriginalCentavos: original,
    });
  }
}
