import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { LRUCache } from 'lru-cache';
import { QueryTypes, type Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ClockService } from '../../../common/clock/clock.service';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import type { VerificadorLimites } from '../../../common/limites/verificador-limites';
import { AppConfig } from '../../../config/app.config';
import { LojistaLimite } from '../models/lojista-limite.model';

export type RecursoLimitado = 'FILIAIS' | 'PRODUTOS_POR_FILIAL';

const COLUNA_POR_RECURSO = {
  FILIAIS: 'maxFiliais',
  PRODUTOS_POR_FILIAL: 'maxProdutosPorFilial',
} as const satisfies Record<RecursoLimitado, keyof LojistaLimite>;

/** Linhas não excluídas; o tenant_id está explícito porque o hook não cobre sequelize.query. */
const SQL_CONTAGEM: Record<RecursoLimitado, string> = {
  FILIAIS: 'SELECT count(*) AS n FROM filiais WHERE tenant_id = :tenantId AND deleted_at IS NULL',
  PRODUTOS_POR_FILIAL:
    'SELECT count(*) AS n FROM produtos WHERE tenant_id = :tenantId AND filial_id = :filialId AND deleted_at IS NULL',
};

const CACHE_IMAGEM_MS = 30_000;

/**
 * Implementação real do VerificadorLimites (RNF12), no lugar do SemLimitesVerificador.
 * Produtos vencidos não excluídos contam: continuam guardados (RN25) e o lojista pode
 * excluí-los para liberar espaço.
 */
@Injectable()
export class LimitesService implements VerificadorLimites {
  private readonly imagemPorTenant = new LRUCache<string, { bytes: number; expiraEm: number }>({
    max: 10_000,
  });

  constructor(
    @InjectModel(LojistaLimite) private readonly limiteModel: typeof LojistaLimite,
    private readonly sequelize: Sequelize,
    private readonly config: AppConfig,
    private readonly clock: ClockService,
  ) {}

  verificarCriacaoFilial(tenantId: string, opts: { transaction: Transaction }): Promise<void> {
    return this.verificar(tenantId, 'FILIAIS', opts);
  }

  verificarCriacaoProduto(
    tenantId: string,
    filialId: string,
    opts: { transaction: Transaction },
  ): Promise<void> {
    return this.verificar(tenantId, 'PRODUTOS_POR_FILIAL', { ...opts, filialId });
  }

  /** min(MAX_IMAGEM_BYTES global, limite do lojista), cacheado 30 s por tenant. */
  async maxImagemBytes(tenantId: string): Promise<number> {
    const agora = this.clock.agora().getTime();
    const emCache = this.imagemPorTenant.get(tenantId);
    if (emCache && emCache.expiraEm > agora) return emCache.bytes;

    const linha = await this.limiteModel.findByPk(tenantId, { attributes: ['maxImagemBytes'] });
    const global = this.config.maxImagemBytes;
    const bytes = linha?.maxImagemBytes ? Math.min(global, linha.maxImagemBytes) : global;
    this.imagemPorTenant.set(tenantId, { bytes, expiraEm: agora + CACHE_IMAGEM_MS });
    return bytes;
  }

  /**
   * Chamado DENTRO da transação de criação. Sem limite configurado não há lock nem contagem;
   * com limite, o FOR UPDATE na linha do lojista serializa criações concorrentes do tenant.
   */
  private async verificar(
    tenantId: string,
    recurso: RecursoLimitado,
    ctx: { transaction: Transaction; filialId?: string },
  ): Promise<void> {
    const coluna = COLUNA_POR_RECURSO[recurso];
    const linha = await this.limiteModel.findByPk(tenantId, {
      attributes: [coluna],
      transaction: ctx.transaction,
    });
    const limite = linha?.[coluna];
    if (limite === null || limite === undefined) return;

    await this.sequelize.query('SELECT 1 FROM lojistas WHERE id = :tenantId FOR UPDATE', {
      replacements: { tenantId },
      transaction: ctx.transaction,
    });
    const [contagem] = await this.sequelize.query<{ n: string }>(SQL_CONTAGEM[recurso], {
      replacements: { tenantId, filialId: ctx.filialId ?? null },
      type: QueryTypes.SELECT,
      transaction: ctx.transaction,
    });
    if (Number(contagem?.n ?? 0) >= limite) {
      throw new AppError(CodigoErro.LIMITE_DO_PLANO_ATINGIDO, undefined, { recurso, limite });
    }
  }
}
