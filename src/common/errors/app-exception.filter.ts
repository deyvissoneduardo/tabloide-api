import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AppError } from './app.error';
import { CodigoErro } from './codigos-erro';
import { traduzirErroPg } from './pg-erros';

const CODIGO_POR_STATUS_HTTP: Partial<Record<number, CodigoErro>> = {
  [HttpStatus.BAD_REQUEST]: CodigoErro.VALIDACAO_INVALIDA,
  [HttpStatus.UNAUTHORIZED]: CodigoErro.NAO_AUTENTICADO,
  [HttpStatus.NOT_FOUND]: CodigoErro.RECURSO_NAO_ENCONTRADO,
  [HttpStatus.METHOD_NOT_ALLOWED]: CodigoErro.RECURSO_NAO_ENCONTRADO,
  [HttpStatus.PAYLOAD_TOO_LARGE]: CodigoErro.VALIDACAO_INVALIDA,
  [HttpStatus.TOO_MANY_REQUESTS]: CodigoErro.MUITAS_TENTATIVAS,
};

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('AppExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const erro = this.paraAppError(exception);

    if (req?.id) res.setHeader('x-request-id', String(req.id));
    if (erro.codigo === CodigoErro.MUITAS_TENTATIVAS) this.copiarRetryAfter(res);
    res.status(erro.status).json({
      erro: {
        codigo: erro.codigo,
        mensagem: erro.message,
        ...(erro.detalhes ? { detalhes: erro.detalhes } : {}),
      },
    });
  }

  /** Throttlers nomeados enviam "Retry-After-<nome>"; clientes HTTP entendem só "Retry-After". */
  private copiarRetryAfter(res: Response): void {
    const nomeado = res.getHeaderNames?.().find((h) => h.startsWith('retry-after-'));
    if (nomeado) res.setHeader('Retry-After', String(res.getHeader(nomeado)));
  }

  paraAppError(exception: unknown): AppError {
    if (exception instanceof AppError) return exception;
    if (exception instanceof ThrottlerException) return new AppError(CodigoErro.MUITAS_TENTATIVAS);
    if (exception instanceof HttpException) {
      const codigo = CODIGO_POR_STATUS_HTTP[exception.getStatus()];
      if (codigo) return new AppError(codigo);
    }
    const traduzido = traduzirErroPg(exception);
    if (traduzido) return traduzido;

    const stack = exception instanceof Error ? exception.stack : String(exception);
    this.logger.error('Erro inesperado', stack);
    return new AppError(CodigoErro.ERRO_INTERNO);
  }
}
