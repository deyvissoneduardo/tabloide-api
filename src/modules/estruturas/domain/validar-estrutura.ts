export type TipoProblemaEstrutura =
  | 'CATEGORIA_DESCONHECIDA'
  | 'PRODUTO_DESCONHECIDO'
  | 'PRODUTO_FORA_DA_CATEGORIA'
  | 'CATEGORIA_REPETIDA'
  | 'PRODUTO_REPETIDO';

export interface ProblemaEstrutura {
  tipo: TipoProblemaEstrutura;
  id: string;
}

export interface PosicoesCalculadas {
  categorias: Array<{ id: string; posicao: number }>;
  produtos: Array<{ id: string; posicao: number }>;
}

export interface ItensDaFilial {
  /** Categorias não excluídas da filial. */
  categorias: ReadonlySet<string>;
  /** Produto não excluído da filial (qualquer situação) → sua categoria. */
  categoriaDoProduto: ReadonlyMap<string, string>;
}

export type ResultadoEstrutura =
  { ok: true; valor: PosicoesCalculadas } | { ok: false; problemas: ProblemaEstrutura[] };

/**
 * RN45: a posição é o índice no array (categoria na filial; produto na sua categoria).
 * Junta todos os problemas, sem parar no primeiro. Produto vencido é aceito: venceu entre o
 * GET e o PUT e não aparece na página, então a posição dele não tem efeito.
 */
export function validarEstrutura(
  entrada: ReadonlyArray<{ id: string; produtos: readonly string[] }>,
  existentes: ItensDaFilial,
): ResultadoEstrutura {
  const problemas: ProblemaEstrutura[] = [];
  const posicoes: PosicoesCalculadas = { categorias: [], produtos: [] };
  const categoriasVistas = new Set<string>();
  const produtosVistos = new Set<string>();

  entrada.forEach((categoria, indiceCategoria) => {
    if (categoriasVistas.has(categoria.id)) {
      problemas.push({ tipo: 'CATEGORIA_REPETIDA', id: categoria.id });
      return;
    }
    categoriasVistas.add(categoria.id);
    if (!existentes.categorias.has(categoria.id)) {
      problemas.push({ tipo: 'CATEGORIA_DESCONHECIDA', id: categoria.id });
      return;
    }
    posicoes.categorias.push({ id: categoria.id, posicao: indiceCategoria });

    categoria.produtos.forEach((produto, indiceProduto) => {
      if (produtosVistos.has(produto)) {
        problemas.push({ tipo: 'PRODUTO_REPETIDO', id: produto });
        return;
      }
      produtosVistos.add(produto);
      const categoriaReal = existentes.categoriaDoProduto.get(produto);
      if (categoriaReal === undefined) {
        problemas.push({ tipo: 'PRODUTO_DESCONHECIDO', id: produto });
      } else if (categoriaReal !== categoria.id) {
        problemas.push({ tipo: 'PRODUTO_FORA_DA_CATEGORIA', id: produto });
      } else {
        posicoes.produtos.push({ id: produto, posicao: indiceProduto });
      }
    });
  });

  return problemas.length > 0 ? { ok: false, problemas } : { ok: true, valor: posicoes };
}
