import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

export const MAX_IMAGEM_BYTES_PADRAO = 10 * 1024 * 1024;

@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get publicBaseUrl(): string {
    return this.config.get('PUBLIC_BASE_URL', { infer: true });
  }

  get fusoHorarioPadrao(): string {
    return this.config.get('FUSO_HORARIO_PADRAO', { infer: true });
  }

  get maxImagemBytes(): number {
    return MAX_IMAGEM_BYTES_PADRAO;
  }
}
