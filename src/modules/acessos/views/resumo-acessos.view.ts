import { ApiProperty } from '@nestjs/swagger';
import { ApiDataISO } from '../../../common/swagger/data-iso.decorator';
import type { DataISO } from '../../../common/utils/date-only';
import type { ResumoAcessos } from '../domain/montar-resumo';

export class IntervaloAcessosView {
  @ApiDataISO()
  inicio!: DataISO;
  @ApiDataISO()
  fim!: DataISO;
}

export class AcessosPorFilialView {
  filialId!: string;
  nome!: string;
  /** RN57: filial excluída aparece só com acessos no período. */
  excluida!: boolean;
  total!: number;
}

export class AcessosPorDiaView {
  @ApiDataISO()
  data!: DataISO;
  total!: number;
}

export class InicioPanfletoView {
  @ApiDataISO()
  data!: DataISO;
  filialId!: string;
}

export class PicoAcessosView {
  /** RN54: total do período ≥ minimo. */
  disponivel!: boolean;
  minimo!: number;
  @ApiProperty({ type: [Number], nullable: true, description: '24 posições, hora local da filial 0–23' })
  porHora!: number[] | null;
  @ApiProperty({ type: [Number], nullable: true, description: '7 posições, de segunda a domingo' })
  porDiaSemana!: number[] | null;
}

export class ResumoAcessosView {
  intervalo!: IntervaloAcessosView;
  /** Respeita filialId. */
  total!: number;
  /** Ranking: ignora filialId. */
  porFilial!: AcessosPorFilialView[];
  /** Um item por data do intervalo, com 0 nos dias sem acesso. */
  porDia!: AcessosPorDiaView[];
  iniciosPanfleto!: InicioPanfletoView[];
  pico!: PicoAcessosView;
}

/** Só os campos do contrato (§3.3): sem tenantId nem deletedAt (vira excluida). */
export function resumoAcessosView(r: ResumoAcessos): ResumoAcessosView {
  return {
    intervalo: { inicio: r.intervalo.inicio, fim: r.intervalo.fim },
    total: r.total,
    porFilial: r.porFilial.map((f) => ({
      filialId: f.filialId,
      nome: f.nome,
      excluida: f.excluida,
      total: f.total,
    })),
    porDia: r.porDia.map((d) => ({ data: d.data, total: d.total })),
    iniciosPanfleto: r.iniciosPanfleto.map((i) => ({ data: i.data, filialId: i.filialId })),
    pico: {
      disponivel: r.pico.disponivel,
      minimo: r.pico.minimo,
      porHora: r.pico.porHora,
      porDiaSemana: r.pico.porDiaSemana,
    },
  };
}
