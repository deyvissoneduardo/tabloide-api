import type { DataISO, ItemComVigencia, Situacao } from './vigencia.types';

/**
 * Situação do item na data local da filial. Comparar strings YYYY-MM-DD já implementa a RN24:
 * o início vale a partir de 00:00 e o limite até 23:59:59 locais. A ordem dos testes importa.
 */
export function calcularSituacao(item: ItemComVigencia, hoje: DataISO): Situacao {
  if (item.deletedAt !== null) return 'EXCLUIDO';
  if (hoje < item.dataInicio) return 'AGENDADO';
  if (item.dataLimite !== null && hoje > item.dataLimite) return 'VENCIDO';
  return 'VIGENTE';
}
