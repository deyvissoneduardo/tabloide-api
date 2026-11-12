import type { DataISO } from '../../../common/utils/date-only';

export type SituacaoAcessosPanfleto = 'VIGENTE' | 'VENCIDO' | 'EXCLUIDO';

export interface VigenciaEfetiva {
  inicio: DataISO;
  fim: DataISO;
  situacao: SituacaoAcessosPanfleto;
}

/** Uma linha do relatório de acessos por panfleto (§3.4). */
export interface AcessosDoPanfleto {
  panfletoId: string;
  dataInicio: DataISO;
  dataLimite: DataISO | null;
  dataFimContagem: DataISO;
  situacao: SituacaoAcessosPanfleto;
  totalAcessos: number;
  dias: number;
  mediaPorDia: number;
}

const menor = (...datas: Array<DataISO | null>): DataISO =>
  datas.filter((d): d is DataISO => d !== null).reduce((a, b) => (b < a ? b : a));

/**
 * RN55: período em que o panfleto esteve de fato na página: do início até o menor entre a data
 * limite, a data local da exclusão e hoje. null = não começou ou foi excluído antes de começar.
 */
export function vigenciaEfetiva(
  p: { dataInicio: DataISO; dataLimite: DataISO | null; dataExclusao: DataISO | null },
  hoje: DataISO,
): VigenciaEfetiva | null {
  if (hoje < p.dataInicio) return null;
  const fim = menor(p.dataLimite, p.dataExclusao, hoje);
  if (fim < p.dataInicio) return null;
  const situacao: SituacaoAcessosPanfleto =
    p.dataExclusao !== null ? 'EXCLUIDO' : fim === hoje ? 'VIGENTE' : 'VENCIDO';
  return { inicio: p.dataInicio, fim, situacao };
}

export function cruzaIntervalo(
  v: { inicio: DataISO; fim: DataISO },
  filtro: { inicio: DataISO; fim: DataISO },
): boolean {
  return v.inicio <= filtro.fim && v.fim >= filtro.inicio;
}
