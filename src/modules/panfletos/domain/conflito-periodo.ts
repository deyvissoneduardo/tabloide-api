import type { DataISO } from '../../../common/utils/date-only';
import { periodosSeSobrepoem } from '../../vigencia/domain/periodos';

export interface PeriodoPanfleto {
  id?: string;
  dataInicio: DataISO;
  dataLimite: DataISO | null;
}

export type Conflito = { tipo: 'SEM_DATA_LIMITE' | 'SOBREPOSTO'; com: PeriodoPanfleto } | null;

/**
 * RN16/RN17: procura, entre os panfletos não excluídos da filial, algum que cruze o novo período.
 * Se o conflito é com um panfleto sem data limite que começa antes (ou junto), o lojista precisa
 * definir a data limite dele; senão é sobreposição simples, apontando sempre o de menor início.
 */
export function encontrarConflito(
  novo: PeriodoPanfleto,
  existentes: readonly PeriodoPanfleto[],
  ignorarId?: string,
): Conflito {
  const periodoNovo = { inicio: novo.dataInicio, limite: novo.dataLimite };
  const conflitantes = existentes
    .filter((e) => ignorarId === undefined || e.id !== ignorarId)
    .filter((e) => periodosSeSobrepoem(periodoNovo, { inicio: e.dataInicio, limite: e.dataLimite }));
  if (conflitantes.length === 0) return null;

  const semLimite = conflitantes.find((e) => e.dataLimite === null && e.dataInicio <= novo.dataInicio);
  if (semLimite) return { tipo: 'SEM_DATA_LIMITE', com: semLimite };

  const primeiro = [...conflitantes].sort((a, b) => (a.dataInicio < b.dataInicio ? -1 : 1))[0]!;
  return { tipo: 'SOBREPOSTO', com: primeiro };
}
