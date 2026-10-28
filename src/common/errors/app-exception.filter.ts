import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { LogsErroService } from '../../modules/logs-erro/services/logs-erro.service';
import { AppError } from './app.error';
import { CodigoErro } from './codigos-erro';
import { traduzirErroPg } from './pg-erros';

const CODIGO_POR_STATUS_HTTP: Partial<Record<number, CodigoErro>> = {
  [HttpStatus.BAD_REQUEST]: CodigoErro.VALIDACAO_INVALIDA,
  [HttpStatus.UNAUTHORIZED]: CodigoErro.NAO_AUTENTICADO,
  [HttpStatus.NOT_FOUND]: CodigoErro.RECURSO_NAO_ENCONTRADO,
  [HttpStatus.METHOD_NOT_ALLOWED]: CodigoErro.RECURSO_NAO_ENCONTRADO,
  [HttpStatus.PAYLOAD_TOO_LARGE]: CodigoErro.CORPO_MUITO_GRANDE,
  [HttpStatus.TOO_MANY_REQUESTS]: CodigoErro.MUITAS_TENTATIVAS,
};

/** Erros do body-parser (http-errors): JSON malformado, corpo acima do limite (100 KB). */
function erroDoBodyParser(exception: unknown): AppError | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const { status, type } = exception as { status?: unknown; type?: unknown };
  if (typeof status !== 'number' || typeof type !== 'string' || status < 400 || status >= 500) return null;
  return new AppError(
    status === HttpStatus.PAYLOAD_TOO_LARGE ? CodigoErro.CORPO_MUITO_GRANDE : CodigoErro.VALIDACAO_INVALIDA,
  );
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('AppExceptionFilter');

  constructor(@Optional() private readonly logsErro?: LogsErroService) {}

  catch(exception: unknown, host: ArgumentsHost): void | Promise<void> {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const erro = this.paraAppError(exception);

    // grava antes de responder: na Vercel a função pode congelar logo após a resposta
    if (erro.codigo === CodigoErro.ERRO_INTERNO && this.logsErro) {
      return this.logsErro
        .registrar(exception, {
          requestId: req?.id ? String(req.id) : null,
          metodo: req?.method,
          url: req?.originalUrl,
        })
        .catch((falha: unknown) =>
          this.logger.error(
            'Falha ao gravar logs_erro',
            falha instanceof Error ? falha.stack : String(falha),
          ),
        )
        .then(() => this.responder(req, res, erro));
    }
    this.responder(req, res, erro);
  }

  private responder(req: Request, res: Response, erro: AppError): void {
    if (req?.id) res.setHeader('x-request-id', String(req.id));
    if (erro.codigo === CodigoErro.MUITAS_TENTATIVAS) this.copiarRetryAfter(res);
    // página pública: o 404 também é cacheável, mas por pouco tempo (lojista recém-ativado)
    if (erro.codigo === CodigoErro.RECURSO_NAO_ENCONTRADO && req?.originalUrl?.startsWith('/v1/publico/')) {
      res.setHeader('Cache-Control', 'public, max-age=10');
    }
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
    const doParser = erroDoBodyParser(exception);
    if (doParser) return doParser;
    const traduzido = traduzirErroPg(exception);
    if (traduzido) return traduzido;

    const stack = exception instanceof Error ? exception.stack : String(exception);
    this.logger.error('Erro inesperado', stack);
    return new AppError(CodigoErro.ERRO_INTERNO);
  }
}
