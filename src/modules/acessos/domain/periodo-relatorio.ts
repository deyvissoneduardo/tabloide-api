import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { diasEntre, somarDias, type DataISO } from '../../../common/utils/date-only';

export const PERIODOS_PREDEFINIDOS = [1, 7, 15, 30] as const;
export type DiasPredefinidos = (typeof PERIODOS_PREDEFINIDOS)[number];

export const PERIODO_PADRAO: DiasPredefinidos = 30;
export const MAXIMO_DIAS_PERIODO = 366;
/** RN54: abaixo disto o horário de pico não é estatisticamente útil. */
export const MINIMO_ACESSOS_PICO = 100;

export type PeriodoPedido =
  { tipo: 'PREDEFINIDO'; dias: DiasPredefinidos } | { tipo: 'PERSONALIZADO'; inicio: DataISO; fim: DataISO };

export type MotivoPeriodoInvalido =
  'COMBINACAO' | 'FIM_ANTES_DO_INICIO' | 'FIM_NO_FUTURO' | 'ACIMA_DE_366_DIAS';

export interface Intervalo {
  inicio: DataISO;
  fim: DataISO;
}

export const periodoInvalido = (motivo: MotivoPeriodoInvalido) =>
  new AppError(CodigoErro.PERIODO_INVALIDO, undefined, { motivo });

/** periodo OU (inicio E fim); nada enviado = 30 dias. O formato já passou pelo DTO. */
export function lerPeriodo(q: { periodo?: number; inicio?: DataISO; fim?: DataISO }): PeriodoPedido {
  const temInicio = q.inicio !== undefined;
  const temFim = q.fim !== undefined;
  if (q.periodo !== undefined) {
    if (temInicio || temFim) throw periodoInvalido('COMBINACAO');
    return { tipo: 'PREDEFINIDO', dias: q.periodo as DiasPredefinidos };
  }
  if (temInicio !== temFim) throw periodoInvalido('COMBINACAO');
  if (temInicio && temFim) return { tipo: 'PERSONALIZADO', inicio: q.inicio!, fim: q.fim! };
  return { tipo: 'PREDEFINIDO', dias: PERIODO_PADRAO };
}

/** null = válido. O predefinido é sempre válido: é relativo ao "hoje" de cada filial. */
export function validarPeriodo(p: PeriodoPedido, hoje: DataISO): MotivoPeriodoInvalido | null {
  if (p.tipo === 'PREDEFINIDO') return null;
  if (p.fim < p.inicio) return 'FIM_ANTES_DO_INICIO';
  if (p.fim > hoje) return 'FIM_NO_FUTURO';
  if (diasEntre(p.inicio, p.fim) + 1 > MAXIMO_DIAS_PERIODO) return 'ACIMA_DE_366_DIAS';
  return null;
}

export function garantirPeriodoValido(p: PeriodoPedido, hoje: DataISO): void {
  const motivo = validarPeriodo(p, hoje);
  if (motivo) throw periodoInvalido(motivo);
}

/** RN53: o predefinido usa o "hoje" da filial; o personalizado é o mesmo para todas. */
export function intervaloDaFilial(p: PeriodoPedido, hojeFilial: DataISO): Intervalo {
  if (p.tipo === 'PERSONALIZADO') return { inicio: p.inicio, fim: p.fim };
  return { inicio: somarDias(hojeFilial, -(p.dias - 1)), fim: hojeFilial };
}
