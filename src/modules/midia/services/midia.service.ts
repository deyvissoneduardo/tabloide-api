import { Inject, Injectable } from '@nestjs/common';
import { fromBuffer } from 'file-type';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { VERIFICADOR_LIMITES, type VerificadorLimites } from '../../../common/limites/verificador-limites';
import { AppConfig } from '../../../config/app.config';
import { montarCaminho } from '../domain/caminho-midia';
import type { ImagemProcessada } from '../domain/imagem-processada';
import type { ArquivoProcessado } from '../domain/pdf-processado';
import type { PerfilImagem } from '../domain/perfis-imagem';
import { TIPOS_PANFLETO_ACEITOS } from '../domain/tipos-aceitos';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import { ImageProcessor } from './image-processor.service';
import { PdfProcessor } from './pdf-processor.service';

/**
 * Única porta de entrada de imagens. processar e salvar são separados porque o
 * panfleto valida as regras de período entre os dois (D3.3).
 */
@Injectable()
export class MidiaService {
  constructor(
    private readonly processor: ImageProcessor,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(VERIFICADOR_LIMITES) private readonly limites: VerificadorLimites,
    private readonly pdf: PdfProcessor,
    private readonly config: AppConfig,
  ) {}

  async processar(tenantId: string, entrada: Buffer, perfil: PerfilImagem): Promise<ImagemProcessada> {
    const maxBytes = await this.limites.maxImagemBytes(tenantId);
    if (entrada.length > maxBytes)
      throw new AppError(CodigoErro.IMAGEM_MUITO_GRANDE, undefined, { maxBytes });
    return this.processor.processar(entrada, perfil);
  }

  /** RN13: imagem (vira WebP) ou PDF de 1 página (guardado como veio). O tipo vem dos magic bytes. */
  async processarPanfleto(tenantId: string, entrada: Buffer): Promise<ArquivoProcessado> {
    const tipo = await fromBuffer(entrada);
    if (tipo?.mime === 'application/pdf') {
      const maxBytes = Math.min(this.config.maxPdfBytes, await this.limites.maxImagemBytes(tenantId));
      return this.pdf.processar(entrada, maxBytes);
    }
    try {
      return await this.processar(tenantId, entrada, 'panfleto');
    } catch (err) {
      if (err instanceof AppError && err.codigo === CodigoErro.IMAGEM_INVALIDA) {
        throw new AppError(CodigoErro.IMAGEM_INVALIDA, undefined, {
          tiposAceitos: [...TIPOS_PANFLETO_ACEITOS],
        });
      }
      throw err;
    }
  }

  async salvar(tenantId: string, perfil: PerfilImagem, arquivo: ArquivoProcessado): Promise<string> {
    const caminho = montarCaminho(
      tenantId,
      perfil,
      arquivo.contentType === 'application/pdf' ? 'pdf' : 'webp',
    );
    await this.storage.salvar(arquivo.conteudo, caminho, arquivo.contentType);
    return caminho;
  }

  urlPublica(caminho: string | null): string | null {
    return caminho === null ? null : this.storage.urlPublica(caminho);
  }
}
