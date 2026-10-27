import { ApiDataISO } from '../../../common/swagger/data-iso.decorator';
import type { DataISO } from '../../../common/utils/date-only';
import { calcularSituacao } from '../../vigencia/domain/situacao';

export class ProdutoDaEstruturaView {
  id!: string;
  nome!: string;
  quantidade!: string | null;
  descricao!: string | null;
  observacao!: string | null;
  precoPromocionalCentavos!: number;
  precoOriginalCentavos!: number | null;
  urlFoto!: string | null;
  @ApiDataISO()
  dataInicio!: DataISO;
  @ApiDataISO({ anulavel: true })
  dataLimite!: DataISO | null;
  /** A estrutura só lista produtos vigentes e agendados. */
  situacao!: 'VIGENTE' | 'AGENDADO';
  editavel!: boolean;
}

export class CategoriaDaEstruturaView {
  id!: string;
  nome!: string;
  produtos!: ProdutoDaEstruturaView[];
}

/** RN45: ordem da página da filial, já ordenada (posição, depois nome pt-BR). */
export class EstruturaView {
  categorias!: CategoriaDaEstruturaView[];
}

export interface CategoriaDaEstruturaRow {
  id: string;
  nome: string;
}

export interface ProdutoDaEstruturaRow {
  id: string;
  nome: string;
  quantidade: string | null;
  descricao: string | null;
  observacao: string | null;
  precoPromocionalCentavos: number;
  precoOriginalCentavos: number | null;
  fotoPath: string | null;
  dataInicio: DataISO;
  dataLimite: DataISO | null;
}

/**
 * Recebe categorias e produtos já ordenados. Nunca expõe fotoPath, tenantId, posicao nem
 * nomeNormalizado. editavel existe para o front reaproveitar a leitura de vigência.
 */
export function estruturaView(
  categorias: readonly CategoriaDaEstruturaRow[],
  produtosPorCategoria: ReadonlyMap<string, readonly ProdutoDaEstruturaRow[]>,
  hoje: DataISO,
  urlPublica: (caminho: string | null) => string | null,
): EstruturaView {
  return {
    categorias: categorias.map((categoria) => ({
      id: categoria.id,
      nome: categoria.nome,
      produtos: (produtosPorCategoria.get(categoria.id) ?? []).map((produto) => {
        const situacao = calcularSituacao(
          { dataInicio: produto.dataInicio, dataLimite: produto.dataLimite, deletedAt: null },
          hoje,
        ) as ProdutoDaEstruturaView['situacao'];
        return {
          id: produto.id,
          nome: produto.nome,
          quantidade: produto.quantidade ?? null,
          descricao: produto.descricao ?? null,
          observacao: produto.observacao ?? null,
          precoPromocionalCentavos: produto.precoPromocionalCentavos,
          precoOriginalCentavos: produto.precoOriginalCentavos ?? null,
          urlFoto: urlPublica(produto.fotoPath ?? null),
          dataInicio: produto.dataInicio,
          dataLimite: produto.dataLimite ?? null,
          situacao,
          editavel: situacao === 'AGENDADO' || situacao === 'VIGENTE',
        };
      }),
    })),
  };
}
