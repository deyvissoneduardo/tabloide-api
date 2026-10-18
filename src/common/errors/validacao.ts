import type { ValidationError } from 'class-validator';
import { AppError } from './app.error';
import { CodigoErro } from './codigos-erro';

function achatar(erros: ValidationError[], prefixo: string, campos: Record<string, string[]>): void {
  for (const erro of erros) {
    const caminho = prefixo ? `${prefixo}.${erro.property}` : erro.property;
    if (erro.constraints) {
      const chave = caminho || '_';
      campos[chave] = [...(campos[chave] ?? []), ...Object.values(erro.constraints)];
    }
    if (erro.children?.length) achatar(erro.children, caminho, campos);
  }
}

export function errosDeValidacaoParaAppError(erros: ValidationError[]): AppError {
  const campos: Record<string, string[]> = {};
  achatar(erros, '', campos);
  return new AppError(CodigoErro.VALIDACAO_INVALIDA, undefined, { campos });
}
