import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Observable } from 'rxjs';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { AppConfig } from '../../../config/app.config';

export const CAMPO_IMAGEM = 'imagem';

const erroNoCampoImagem = (mensagem: string) =>
  new AppError(CodigoErro.VALIDACAO_INVALIDA, undefined, { campos: { [CAMPO_IMAGEM]: [mensagem] } });

/**
 * Recebe exatamente um arquivo no campo "imagem", em memória, com o teto de MAX_IMAGEM_BYTES.
 * Traduz os erros do multer para o contrato de erros e exige o arquivo.
 */
@Injectable()
export class UploadImagemInterceptor implements NestInterceptor {
  private readonly multer: NestInterceptor;

  constructor(private readonly config: AppConfig) {
    const Interceptor = FileInterceptor(CAMPO_IMAGEM, {
      storage: memoryStorage(),
      limits: { fileSize: config.maxImagemBytes, files: 1, fields: 5, fieldSize: 1024, parts: 7 },
    });
    this.multer = new Interceptor();
  }

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      await this.multer.intercept(ctx, { handle: () => undefined as never });
    } catch (err) {
      throw this.traduzir(err);
    }
    const req = ctx.switchToHttp().getRequest<{ file?: Express.Multer.File }>();
    if (!req.file) throw erroNoCampoImagem('Envie a imagem no campo "imagem".');
    return next.handle();
  }

  private traduzir(err: unknown): unknown {
    if (err instanceof PayloadTooLargeException) {
      return new AppError(CodigoErro.IMAGEM_MUITO_GRANDE, undefined, {
        maxBytes: this.config.maxImagemBytes,
      });
    }
    if (err instanceof BadRequestException)
      return erroNoCampoImagem('Envie um único arquivo no campo "imagem".');
    return err;
  }
}
