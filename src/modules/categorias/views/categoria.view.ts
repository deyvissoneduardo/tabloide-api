/** Linha da consulta agregada; o Postgres devolve COUNT como string (bigint). */
export interface CategoriaComContagem {
  id: string;
  nome: string;
  vigentes: string | number;
  agendados: string | number;
  vencidos: string | number;
  /** RN45: só para ordenar; não sai na view. */
  posicao: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ContagemProdutosView {
  vigentes!: number;
  agendados!: number;
  vencidos!: number;
}

export class CategoriaView {
  id!: string;
  nome!: string;
  produtos!: ContagemProdutosView;
  podeExcluir!: boolean;
  criadoEm!: string;
  atualizadoEm!: string;
}

/** podeExcluir antecipa a RN20 para o front; os vencidos são excluídos junto com a categoria. */
export function categoriaView(c: CategoriaComContagem): CategoriaView {
  const produtos = {
    vigentes: Number(c.vigentes),
    agendados: Number(c.agendados),
    vencidos: Number(c.vencidos),
  };
  return {
    id: c.id,
    nome: c.nome,
    produtos,
    podeExcluir: produtos.vigentes + produtos.agendados === 0,
    criadoEm: new Date(c.createdAt).toISOString(),
    atualizadoEm: new Date(c.updatedAt).toISOString(),
  };
}
