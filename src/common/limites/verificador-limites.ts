import { Injectable } from '@nestjs/common';
import type { Transaction } from 'sequelize';
import { AppConfig } from '../../config/app.config';

export const VERIFICADOR_LIMITES = Symbol('VERIFICADOR_LIMITES');

export interface VerificadorLimites {
  verificarCriacaoFilial(tenantId: string, opts: { transaction: Transaction }): Promise<void>;
  verificarCriacaoProduto(
    tenantId: string,
    filialId: string,
    opts: { transaction: Transaction },
  ): Promise<void>;
  maxImagemBytes(tenantId: string): Promise<number>;
}

@Injectable()
export class SemLimitesVerificador implements VerificadorLimites {
  constructor(private readonly config: AppConfig) {}

  async verificarCriacaoFilial(): Promise<void> {}

  async verificarCriacaoProduto(): Promise<void> {}

  async maxImagemBytes(): Promise<number> {
    return this.config.maxImagemBytes;
  }
}
