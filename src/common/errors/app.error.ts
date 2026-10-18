import { CodigoErro, MENSAGEM_POR_CODIGO, STATUS_POR_CODIGO } from './codigos-erro';

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly codigo: CodigoErro,
    mensagem?: string,
    readonly detalhes?: Record<string, unknown>,
  ) {
    super(mensagem ?? MENSAGEM_POR_CODIGO[codigo]);
    this.name = 'AppError';
    this.status = STATUS_POR_CODIGO[codigo];
  }
}
