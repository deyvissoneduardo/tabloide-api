import type { DataISO, Periodo } from './vigencia.types';

/** Representa "sem data limite" nas comparações. */
export const INFINITO = '9999-12-31' as DataISO;

/**
 * Intervalos fechados: encostar no mesmo dia conta como sobreposição.
 * Mesma semântica do daterange(..., '[]') usado no EXCLUDE da Fase 3.
 */
export function periodosSeSobrepoem(a: Periodo, b: Periodo): boolean {
  return a.inicio <= (b.limite ?? INFINITO) && b.inicio <= (a.limite ?? INFINITO);
}
