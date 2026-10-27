import { compararTextoPtBr } from './text';

export interface ItemOrdenavel {
  id: string;
  nome: string;
  posicao: number | null;
}

/** RN30/RN45: posicionados primeiro (crescente); depois os sem posição, em ordem alfabética pt-BR; empate por id. */
export function compararPorPosicao(a: ItemOrdenavel, b: ItemOrdenavel): number {
  if (a.posicao !== null && b.posicao !== null && a.posicao !== b.posicao) return a.posicao - b.posicao;
  if (a.posicao !== null && b.posicao === null) return -1;
  if (a.posicao === null && b.posicao !== null) return 1;
  return compararTextoPtBr(a.nome, b.nome) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Devolve uma cópia ordenada; não altera a entrada. */
export function ordenarPorPosicao<T extends ItemOrdenavel>(itens: readonly T[]): T[] {
  return [...itens].sort(compararPorPosicao);
}
