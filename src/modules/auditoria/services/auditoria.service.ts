import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ClsService } from 'nestjs-cls';
import type { Transaction } from 'sequelize';
import { v7 as uuidv7 } from 'uuid';
import { ClockService } from '../../../common/clock/clock.service';
import { AuditoriaAlteracao, type EntidadeAuditada } from '../models/auditoria-alteracao.model';

export type ValorAuditavel = string | number | null | undefined;
type Valores = Record<string, ValorAuditavel>;

export const CAMPOS_AUDITADOS = {
  FILIAL: ['fusoHorario'],
  PANFLETO: ['dataInicio', 'dataLimite', 'imagemPath'],
  PRODUTO: ['precoPromocionalCentavos', 'precoOriginalCentavos', 'dataInicio', 'dataLimite'],
} as const satisfies Record<EntidadeAuditada, readonly string[]>;

const serializar = (v: ValorAuditavel): string | null => (v === undefined || v === null ? null : String(v));

export interface FiltroAuditoria {
  entidade: EntidadeAuditada;
  entidadeId: string;
  pagina: number;
  porPagina: number;
}

@Injectable()
export class AuditoriaService {
  constructor(
    @InjectModel(AuditoriaAlteracao) private readonly model: typeof AuditoriaAlteracao,
    private readonly clock: ClockService,
    private readonly cls: ClsService,
  ) {}

  async registrarAlteracoes(
    tenantId: string,
    entidade: EntidadeAuditada,
    entidadeId: string,
    antes: Valores,
    depois: Valores,
    camposAuditados: readonly string[],
    opts: { transaction: Transaction },
  ): Promise<number> {
    if (!opts?.transaction) throw new Error('auditoria exige transação');

    const alteradoEm = this.clock.agora();
    const requestId = this.cls.getId() ?? null;
    const linhas = camposAuditados
      .filter((campo) => campo in depois)
      .map((campo) => ({
        campo,
        valorAnterior: serializar(antes[campo]),
        valorNovo: serializar(depois[campo]),
      }))
      .filter((l) => l.valorAnterior !== l.valorNovo)
      .map((l) => ({ id: uuidv7(), tenantId, entidade, entidadeId, alteradoEm, requestId, ...l }));

    if (linhas.length === 0) return 0;
    await this.model.bulkCreate(linhas, { transaction: opts.transaction, returning: false, validate: false });
    return linhas.length;
  }

  registrarCriacao(
    tenantId: string,
    entidade: EntidadeAuditada,
    entidadeId: string,
    valores: Valores,
    camposAuditados: readonly string[],
    opts: { transaction: Transaction },
  ): Promise<number> {
    return this.registrarAlteracoes(tenantId, entidade, entidadeId, {}, valores, camposAuditados, opts);
  }

  async listar(
    tenantId: string,
    filtro: FiltroAuditoria,
  ): Promise<{ itens: AuditoriaAlteracao[]; total: number }> {
    const { rows, count } = await this.model.findAndCountAll({
      where: { tenantId, entidade: filtro.entidade, entidadeId: filtro.entidadeId },
      attributes: { exclude: ['tenantId'] },
      order: [
        ['alteradoEm', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: filtro.porPagina,
      offset: (filtro.pagina - 1) * filtro.porPagina,
    });
    return { itens: rows, total: count };
  }
}
