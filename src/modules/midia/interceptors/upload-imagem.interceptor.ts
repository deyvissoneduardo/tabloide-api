import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  mixin,
  NestInterceptor,
  PayloadTooLargeException,
  type Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Observable } from 'rxjs';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { AppConfig } from '../../../config/app.config';

export const CAMPO_IMAGEM = 'imagem';
export const CAMPO_FOTO = 'foto';

interface OpcoesUpload {
  campo: string;
  /** false: sem arquivo o handler recebe undefined; com JSON o multer nem atua (D4.1). */
  obrigatorio: boolean;
  /** Campos de texto aceitos junto com o arquivo. */
  maxCampos: number;
}

/**
 * Recebe no máximo um arquivo no campo indicado, em memória, com o teto de MAX_IMAGEM_BYTES.
 * Traduz os erros do multer para o contrato de erros e, se obrigatório, exige o arquivo.
 */
export function criarUploadInterceptor({
  campo,
  obrigatorio,
  maxCampos,
}: OpcoesUpload): Type<NestInterceptor> {
  const erroNoCampo = (mensagem: string) =>
    new AppError(CodigoErro.VALIDACAO_INVALIDA, undefined, { campos: { [campo]: [mensagem] } });

  @Injectable()
  class UploadInterceptor implements NestInterceptor {
    private readonly multer: NestInterceptor;

    constructor(@Inject(AppConfig) private readonly config: AppConfig) {
      const Interceptor = FileInterceptor(campo, {
        storage: memoryStorage(),
        limits: {
          fileSize: config.maxImagemBytes,
          files: 1,
          fields: maxCampos,
          fieldSize: 1024,
          parts: maxCampos + 2,
        },
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
      if (obrigatorio && !req.file) throw erroNoCampo(`Envie a imagem no campo "${campo}".`);
      return next.handle();
    }

    private traduzir(err: unknown): unknown {
      if (err instanceof PayloadTooLargeException) {
        return new AppError(CodigoErro.IMAGEM_MUITO_GRANDE, undefined, {
          maxBytes: this.config.maxImagemBytes,
        });
      }
      if (err instanceof BadRequestException)
        return erroNoCampo(`Envie um único arquivo no campo "${campo}".`);
      return err;
    }
  }
  return mixin(UploadInterceptor);
}

/** Panfleto e logo: arquivo obrigatório no campo "imagem". */
export const UploadImagemInterceptor = criarUploadInterceptor({
  campo: CAMPO_IMAGEM,
  obrigatorio: true,
  maxCampos: 5,
});

/** Cadastro de produto: foto opcional junto com os campos do formulário (D4.1). */
export const UploadFotoOpcionalInterceptor = criarUploadInterceptor({
  campo: CAMPO_FOTO,
  obrigatorio: false,
  maxCampos: 20,
});

/** Troca da foto do produto: arquivo obrigatório no campo "foto". */
export const UploadFotoInterceptor = criarUploadInterceptor({
  campo: CAMPO_FOTO,
  obrigatorio: true,
  maxCampos: 0,
});
