import { AppError } from '../errors/app.error';
import { CodigoErro } from '../errors/codigos-erro';

export type DataISO = string & { readonly __brand: 'DataISO' };

const FORMATO_DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function ehDataISO(valor: string): valor is DataISO {
  const partes = FORMATO_DATA_ISO.exec(valor);
  if (!partes) return false;
  const [ano, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

export function paraDataISO(valor: string): DataISO {
  if (!ehDataISO(valor)) {
    throw new AppError(CodigoErro.VALIDACAO_INVALIDA, 'Data inválida. Use o formato AAAA-MM-DD.');
  }
  return valor;
}

const formatadoresPorFuso = new Map<string, Intl.DateTimeFormat>();

function formatadorDoFuso(fuso: string): Intl.DateTimeFormat {
  let formatador = formatadoresPorFuso.get(fuso);
  if (!formatador) {
    formatador = new Intl.DateTimeFormat('en-CA', {
      timeZone: fuso,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatadoresPorFuso.set(fuso, formatador);
  }
  return formatador;
}

export function hojeNoFuso(fuso: string, agora: Date): DataISO {
  return formatadorDoFuso(fuso).format(agora) as DataISO;
}

const relogiosPorFuso = new Map<string, Intl.DateTimeFormat>();

function relogioDoFuso(fuso: string): Intl.DateTimeFormat {
  let formatador = relogiosPorFuso.get(fuso);
  if (!formatador) {
    formatador = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    relogiosPorFuso.set(fuso, formatador);
  }
  return formatador;
}

/**
 * Segundos até a próxima meia-noite no fuso, no mínimo 1. Limita o TTL do cache público à
 * virada do dia; em dia de horário de verão pode errar 1 h, e a checagem de "hoje" a cada
 * leitura do cache garante a correção.
 */
export function segundosAteMeiaNoite(fuso: string, agora: Date): number {
  // hourCycle h23 formata "HH:MM:SS" de 00:00:00 a 23:59:59
  const [hora, minuto, segundo] = relogioDoFuso(fuso).format(agora).split(':').map(Number) as [
    number,
    number,
    number,
  ];
  return Math.max(1, 86_400 - (hora * 3600 + minuto * 60 + segundo));
}

export function ehFusoValido(fuso: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

export function compararDatas(a: DataISO, b: DataISO): -1 | 0 | 1 {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function formatarDiaMes(d: DataISO): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}
