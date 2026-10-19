import { Injectable, Logger } from '@nestjs/common';
import { fromBuffer } from 'file-type';
import pLimit from 'p-limit';
import sharp from 'sharp';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { AppConfig } from '../../../config/app.config';
import type { ImagemProcessada } from '../domain/imagem-processada';
import { PERFIS_IMAGEM, type PerfilImagem } from '../domain/perfis-imagem';
import { ehTipoAceito, TIPOS_IMAGEM_ACEITOS } from '../domain/tipos-aceitos';

// cada imagem é processada uma vez: o cache de operações só gastaria memória
sharp.cache(false);

const imagemInvalida = () =>
  new AppError(CodigoErro.IMAGEM_INVALIDA, undefined, { tiposAceitos: [...TIPOS_IMAGEM_ACEITOS] });

/** Valida pelos magic bytes, redimensiona, aplica a orientação EXIF e converte para WebP sem metadados. */
@Injectable()
export class ImageProcessor {
  private readonly logger = new Logger(ImageProcessor.name);
  private readonly limite: ReturnType<typeof pLimit>;

  constructor(private readonly config: AppConfig) {
    // protege CPU e memória do container em picos de upload (D3.8)
    this.limite = pLimit(config.imagemConcorrencia);
  }

  async processar(entrada: Buffer, perfil: PerfilImagem): Promise<ImagemProcessada> {
    if (entrada.length === 0) throw imagemInvalida();
    if (entrada.length > this.config.maxImagemBytes) {
      throw new AppError(CodigoErro.IMAGEM_MUITO_GRANDE, undefined, { maxBytes: this.config.maxImagemBytes });
    }
    const tipo = await fromBuffer(entrada);
    if (!ehTipoAceito(tipo?.mime)) throw imagemInvalida();

    const inicio = process.hrtime.bigint();
    const resultado = await this.limite(() => this.converter(entrada, perfil));
    this.logger.debug({
      evento: 'midia.processada',
      perfil,
      bytesEntrada: entrada.length,
      bytesSaida: resultado.bytes,
      ms: Number(process.hrtime.bigint() - inicio) / 1e6,
    });
    return resultado;
  }

  /** Separado para os testes simularem a duração do sharp. */
  protected async converter(entrada: Buffer, perfil: PerfilImagem): Promise<ImagemProcessada> {
    const { ladoMaximo, qualidade, effort } = PERFIS_IMAGEM[perfil];
    try {
      const { data, info } = await sharp(entrada, {
        limitInputPixels: this.config.imagemMaxPixels,
        failOn: 'error',
        pages: 1,
        sequentialRead: true,
      })
        .rotate()
        .resize({ width: ladoMaximo, height: ladoMaximo, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: qualidade, effort, alphaQuality: 100 })
        .toBuffer({ resolveWithObject: true });
      return {
        conteudo: data,
        largura: info.width,
        altura: info.height,
        contentType: 'image/webp',
        bytes: info.size,
      };
    } catch (err) {
      if (err instanceof Error && /pixel limit/i.test(err.message)) {
        throw new AppError(CodigoErro.IMAGEM_MUITO_GRANDE, undefined, { motivo: 'dimensoes' });
      }
      throw imagemInvalida();
    }
  }
}
