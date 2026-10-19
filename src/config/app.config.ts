import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

/** Acesso tipado às configurações usadas pelas regras de negócio. */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get publicBaseUrl(): string {
    return this.config.get('PUBLIC_BASE_URL', { infer: true });
  }

  get fusoHorarioPadrao(): string {
    return this.config.get('FUSO_HORARIO_PADRAO', { infer: true });
  }

  /** Teto técnico antes do processamento (RNF05); o limite por lojista (RNF12) vem do VerificadorLimites. */
  get maxImagemBytes(): number {
    return this.config.get('MAX_IMAGEM_BYTES', { infer: true });
  }

  get imagemMaxPixels(): number {
    return this.config.get('IMAGEM_MAX_PIXELS', { infer: true });
  }

  get imagemConcorrencia(): number {
    return this.config.get('IMAGEM_CONCORRENCIA', { infer: true });
  }

  get storageDriver(): 'supabase' | 'disco' {
    return this.config.get('STORAGE_DRIVER', { infer: true });
  }

  get supabase(): { url: string; chaveServico: string; bucket: string } {
    return {
      url: this.config.get('SUPABASE_URL', { infer: true }) ?? '',
      chaveServico: this.config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true }) ?? '',
      bucket: this.config.get('SUPABASE_BUCKET', { infer: true }),
    };
  }

  get midiaLocal(): { diretorio: string; urlBase: string } {
    return {
      diretorio: this.config.get('MIDIA_DIR_LOCAL', { infer: true }),
      urlBase: this.config.get('MIDIA_URL_BASE_LOCAL', { infer: true }),
    };
  }
}
