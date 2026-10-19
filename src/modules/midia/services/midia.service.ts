import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { VERIFICADOR_LIMITES, type VerificadorLimites } from '../../../common/limites/verificador-limites';
import { montarCaminho } from '../domain/caminho-midia';
import type { ImagemProcessada } from '../domain/imagem-processada';
import type { PerfilImagem } from '../domain/perfis-imagem';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import { ImageProcessor } from './image-processor.service';

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
  ) {}

  async processar(tenantId: string, entrada: Buffer, perfil: PerfilImagem): Promise<ImagemProcessada> {
    const maxBytes = await this.limites.maxImagemBytes(tenantId);
    if (entrada.length > maxBytes)
      throw new AppError(CodigoErro.IMAGEM_MUITO_GRANDE, undefined, { maxBytes });
    return this.processor.processar(entrada, perfil);
  }

  async salvar(tenantId: string, perfil: PerfilImagem, imagem: ImagemProcessada): Promise<string> {
    const caminho = montarCaminho(tenantId, perfil);
    await this.storage.salvar(imagem.conteudo, caminho, imagem.contentType);
    return caminho;
  }

  urlPublica(caminho: string | null): string | null {
    return caminho === null ? null : this.storage.urlPublica(caminho);
  }
}
