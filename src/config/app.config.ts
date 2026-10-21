import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

/** Acesso tipado às configurações usadas pelas regras de negócio. */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get porta(): number {
    return this.config.get('PORT', { infer: true });
  }

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

  get corsOrigensPainel(): string[] {
    return this.config.get('CORS_ORIGENS_PAINEL', { infer: true });
  }

  get trustProxy(): number {
    return this.config.get('TRUST_PROXY', { infer: true });
  }

  /** Cache em memória da página pública (seção 7 da Fase 5). */
  get publicoCache(): { max: number; ttlMaxSeg: number; negativoSeg: number; desativado: boolean } {
    return {
      max: this.config.get('PUBLICO_CACHE_MAX', { infer: true }),
      ttlMaxSeg: this.config.get('PUBLICO_CACHE_TTL_MAX_SEG', { infer: true }),
      negativoSeg: this.config.get('PUBLICO_CACHE_NEGATIVO_SEG', { infer: true }),
      desativado: this.config.get('PUBLICO_CACHE_DESATIVADO', { infer: true }),
    };
  }

  get desligamento(): { drenagemMs: number; timeoutMs: number } {
    return {
      drenagemMs: this.config.get('SHUTDOWN_DRENAGEM_MS', { infer: true }),
      timeoutMs: this.config.get('SHUTDOWN_TIMEOUT_MS', { infer: true }),
    };
  }

  get swaggerHabilitado(): boolean {
    return this.config.get('SWAGGER_HABILITADO', { infer: true });
  }
}
