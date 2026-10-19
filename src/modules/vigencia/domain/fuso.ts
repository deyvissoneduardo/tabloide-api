const TAMANHO_MAXIMO = 64;
const MAX_MEMORIZADOS = 500;
const memorizados = new Map<string, string | null>();

function calcular(fuso: string): string | null {
  let canonico: string;
  try {
    canonico = new Intl.DateTimeFormat('en-US', { timeZone: fuso }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
  // só fusos geográficos: recusa UTC, GMT, offsets fixos e Etc/*
  if (!canonico.includes('/') || canonico.startsWith('Etc/')) return null;
  return canonico;
}

/** Devolve o nome IANA canônico do fuso (ex.: "america/manaus" → "America/Manaus") ou null se inválido (RN38). */
export function normalizarFuso(fuso: unknown): string | null {
  if (typeof fuso !== 'string' || fuso.length === 0 || fuso.length > TAMANHO_MAXIMO) return null;
  if (memorizados.has(fuso)) return memorizados.get(fuso) ?? null;
  const resultado = calcular(fuso);
  if (memorizados.size < MAX_MEMORIZADOS) memorizados.set(fuso, resultado);
  return resultado;
}
