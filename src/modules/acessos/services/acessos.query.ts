import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type { DataISO } from '../../../common/utils/date-only';
import type { Intervalo } from '../domain/periodo-relatorio';

export interface FilialDoLojista {
  id: string;
  nome: string;
  fusoHorario: string;
  deletedAt: Date | null;
}

export interface IntervaloDeFilial extends Intervalo {
  filialId: string;
}

export interface IntervaloDePanfleto extends Intervalo {
  panfletoId: string;
}

export interface Agregados {
  porData: Array<{ data: DataISO; total: number }>;
  porHora: Array<{ hora: number; total: number }>;
  /** ISODOW: 1 = segunda … 7 = domingo. */
  porDiaSemana: Array<{ diaSemana: number; total: number }>;
}

export interface PanfletoDaFilial {
  id: string;
  dataInicio: DataISO;
  dataLimite: DataISO | null;
  deletedAt: Date | null;
}

interface LinhaAgregada {
  data: DataISO | null;
  hora: number | null;
  diaSemana: number | null;
  gData: number;
  gHora: number;
  total: number;
}

/** VALUES com CAST explícito (padrão de estrutura.service.ts); os valores vão por replacements. */
function valuesDeIntervalos(
  intervalos: ReadonlyArray<{ id: string; inicio: DataISO; fim: DataISO }>,
  replacements: Record<string, unknown>,
): string {
  return intervalos
    .map(({ id, inicio, fim }, i) => {
      replacements[`id${i}`] = id;
      replacements[`i${i}`] = inicio;
      replacements[`f${i}`] = fim;
      return `(CAST(:id${i} AS uuid), CAST(:i${i} AS date), CAST(:f${i} AS date))`;
    })
    .join(', ');
}

/**
 * Leituras do painel de acessos (D9). O hook de tenant não cobre sequelize.query: toda consulta
 * leva tenant_id explícito, coberto pelos testes de vazamento.
 */
@Injectable()
export class AcessosQuery {
  constructor(private readonly sequelize: Sequelize) {}

  /** Inclui as excluídas (RN57). */
  filiaisDoLojista(tenantId: string): Promise<FilialDoLojista[]> {
    return this.sequelize.query<FilialDoLojista>(
      `SELECT id, nome, fuso_horario AS "fusoHorario", deleted_at AS "deletedAt"
       FROM filiais WHERE tenant_id = :tenantId`,
      { replacements: { tenantId }, type: QueryTypes.SELECT },
    );
  }

  async totaisPorFilial(tenantId: string, intervalos: IntervaloDeFilial[]): Promise<Map<string, number>> {
    if (intervalos.length === 0) return new Map();
    const replacements: Record<string, unknown> = { tenantId };
    const values = valuesDeIntervalos(
      intervalos.map((x) => ({ id: x.filialId, inicio: x.inicio, fim: x.fim })),
      replacements,
    );
    const linhas = await this.sequelize.query<{ filialId: string; total: number }>(
      `WITH p(filial_id, inicio, fim) AS (VALUES ${values})
       SELECT a.filial_id AS "filialId", SUM(a.quantidade)::int AS total
       FROM acessos_filial a
       JOIN p ON p.filial_id = a.filial_id AND a.data BETWEEN p.inicio AND p.fim
       WHERE a.tenant_id = :tenantId
       GROUP BY a.filial_id`,
      { replacements, type: QueryTypes.SELECT },
    );
    return new Map(linhas.map((l) => [l.filialId, l.total]));
  }

  /** Por data, por hora e por dia da semana numa só ida ao banco. */
  async agregados(tenantId: string, intervalos: IntervaloDeFilial[], filialId?: string): Promise<Agregados> {
    const vazio: Agregados = { porData: [], porHora: [], porDiaSemana: [] };
    if (intervalos.length === 0) return vazio;
    const replacements: Record<string, unknown> = { tenantId, filialId: filialId ?? null };
    const values = valuesDeIntervalos(
      intervalos.map((x) => ({ id: x.filialId, inicio: x.inicio, fim: x.fim })),
      replacements,
    );
    const linhas = await this.sequelize.query<LinhaAgregada>(
      `WITH p(filial_id, inicio, fim) AS (VALUES ${values})
       SELECT to_char(a.data, 'YYYY-MM-DD') AS data, a.hora,
              EXTRACT(ISODOW FROM a.data)::int AS "diaSemana",
              GROUPING(a.data) AS "gData", GROUPING(a.hora) AS "gHora",
              SUM(a.quantidade)::int AS total
       FROM acessos_filial a
       JOIN p ON p.filial_id = a.filial_id AND a.data BETWEEN p.inicio AND p.fim
       WHERE a.tenant_id = :tenantId AND (CAST(:filialId AS uuid) IS NULL OR a.filial_id = :filialId)
       GROUP BY GROUPING SETS ((a.data), (a.hora), (EXTRACT(ISODOW FROM a.data)))`,
      { replacements, type: QueryTypes.SELECT },
    );
    for (const l of linhas) {
      if (l.gData === 0) vazio.porData.push({ data: l.data!, total: l.total });
      else if (l.gHora === 0) vazio.porHora.push({ hora: Number(l.hora), total: l.total });
      else vazio.porDiaSemana.push({ diaSemana: l.diaSemana!, total: l.total });
    }
    return vazio;
  }

  /**
   * Inícios de panfleto para marcar no gráfico, inclusive de panfletos excluídos depois de começar.
   * deleted_at::date em UTC é uma aproximação aceita: erro de no máximo um dia, só no marcador.
   */
  iniciosPanfleto(
    tenantId: string,
    intervalo: Intervalo,
    filialId?: string,
  ): Promise<Array<{ data: DataISO; filialId: string }>> {
    return this.sequelize.query<{ data: DataISO; filialId: string }>(
      `SELECT to_char(data_inicio, 'YYYY-MM-DD') AS data, filial_id AS "filialId"
       FROM panfletos
       WHERE tenant_id = :tenantId AND data_inicio BETWEEN :inicio AND :fim
         AND (deleted_at IS NULL OR deleted_at::date >= data_inicio)
         AND (CAST(:filialId AS uuid) IS NULL OR filial_id = :filialId)
       ORDER BY data_inicio, filial_id`,
      {
        replacements: { tenantId, inicio: intervalo.inicio, fim: intervalo.fim, filialId: filialId ?? null },
        type: QueryTypes.SELECT,
      },
    );
  }

  /** Panfletos que já começaram, inclusive os excluídos. */
  panfletosDaFilial(tenantId: string, filialId: string, hoje: DataISO): Promise<PanfletoDaFilial[]> {
    return this.sequelize.query<PanfletoDaFilial>(
      `SELECT id, to_char(data_inicio, 'YYYY-MM-DD') AS "dataInicio",
              to_char(data_limite, 'YYYY-MM-DD') AS "dataLimite", deleted_at AS "deletedAt"
       FROM panfletos
       WHERE tenant_id = :tenantId AND filial_id = :filialId AND data_inicio <= :hoje`,
      { replacements: { tenantId, filialId, hoje }, type: QueryTypes.SELECT },
    );
  }

  /** Soma dos acessos da filial dentro do intervalo de cada panfleto. */
  async somaPorIntervalos(
    tenantId: string,
    filialId: string,
    intervalos: IntervaloDePanfleto[],
  ): Promise<Map<string, number>> {
    if (intervalos.length === 0) return new Map();
    const replacements: Record<string, unknown> = { tenantId, filialId };
    const values = valuesDeIntervalos(
      intervalos.map((x) => ({ id: x.panfletoId, inicio: x.inicio, fim: x.fim })),
      replacements,
    );
    const linhas = await this.sequelize.query<{ panfletoId: string; total: number }>(
      `WITH p(panfleto_id, inicio, fim) AS (VALUES ${values})
       SELECT p.panfleto_id AS "panfletoId", COALESCE(SUM(a.quantidade), 0)::int AS total
       FROM p
       LEFT JOIN acessos_filial a
         ON a.tenant_id = :tenantId AND a.filial_id = :filialId AND a.data BETWEEN p.inicio AND p.fim
       GROUP BY p.panfleto_id`,
      { replacements, type: QueryTypes.SELECT },
    );
    return new Map(linhas.map((l) => [l.panfletoId, l.total]));
  }
}
