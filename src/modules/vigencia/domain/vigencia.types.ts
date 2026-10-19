import type { DataISO } from '../../../common/utils/date-only';

export type { DataISO };

export type Situacao = 'AGENDADO' | 'VIGENTE' | 'VENCIDO' | 'EXCLUIDO';

export interface ItemComVigencia {
  dataInicio: DataISO;
  dataLimite: DataISO | null;
  deletedAt: Date | null;
}

/** Intervalo fechado [inicio, limite]; limite null = sem fim. */
export interface Periodo {
  inicio: DataISO;
  limite: DataISO | null;
}

/** undefined = campo não enviado; null em dataLimite = remover o limite. */
export interface DatasInformadas {
  dataInicio?: DataISO | null;
  dataLimite?: DataISO | null;
}

export type CodigoErroVigencia =
  'DATA_INICIO_INVALIDA' | 'DATA_LIMITE_INVALIDA' | 'ITEM_NAO_EDITAVEL' | 'DATA_INICIO_IMUTAVEL';

export type ResultadoValidacao<T> =
  { ok: true; valor: T } | { ok: false; codigo: CodigoErroVigencia; campo: 'dataInicio' | 'dataLimite' };

export const ok = <T>(valor: T): ResultadoValidacao<T> => ({ ok: true, valor });

export const erro = <T>(
  codigo: CodigoErroVigencia,
  campo: 'dataInicio' | 'dataLimite',
): ResultadoValidacao<T> => ({
  ok: false,
  codigo,
  campo,
});
