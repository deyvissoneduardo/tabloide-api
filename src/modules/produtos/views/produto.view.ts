import { ApiDataISO } from '../../../common/swagger/data-iso.decorator';
import type { DataISO } from '../../../common/utils/date-only';
import { calcularSituacao } from '../../vigencia/domain/situacao';
import type { Situacao } from '../../vigencia/domain/vigencia.types';
import type { Produto } from '../models/produto.model';

export class CategoriaDoProdutoView {
  id!: string;
  nome!: string;
}

export class ProdutoView {
  id!: string;
  filialId!: string;
  categoria!: CategoriaDoProdutoView;
  nome!: string;
  quantidade!: string | null;
  precoPromocionalCentavos!: number;
  precoOriginalCentavos!: number | null;
  descricao!: string | null;
  observacao!: string | null;
  urlFoto!: string | null;
  @ApiDataISO()
  dataInicio!: DataISO;
  @ApiDataISO({ anulavel: true })
  dataLimite!: DataISO | null;
  situacao!: Situacao;
  editavel!: boolean;
  dataInicioEditavel!: boolean;
  criadoEm!: string;
  atualizadoEm!: string;
  excluidoEm!: string | null;
}

/**
 * hoje é calculado uma vez por request, no fuso da filial. As flags refletem a RN26 para o
 * front (D4.9). Nunca expõe fotoPath, tenantId nem nomeNormalizado.
 */
export function produtoView(
  produto: Produto,
  categoria: { id: string; nome: string },
  hoje: DataISO,
  urlFoto: string | null,
): ProdutoView {
  const situacao = calcularSituacao(
    { dataInicio: produto.dataInicio, dataLimite: produto.dataLimite, deletedAt: produto.deletedAt ?? null },
    hoje,
  );
  return {
    id: produto.id,
    filialId: produto.filialId,
    categoria: { id: categoria.id, nome: categoria.nome },
    nome: produto.nome,
    quantidade: produto.quantidade ?? null,
    precoPromocionalCentavos: produto.precoPromocionalCentavos,
    precoOriginalCentavos: produto.precoOriginalCentavos ?? null,
    descricao: produto.descricao ?? null,
    observacao: produto.observacao ?? null,
    urlFoto,
    dataInicio: produto.dataInicio,
    dataLimite: produto.dataLimite ?? null,
    situacao,
    editavel: situacao === 'AGENDADO' || situacao === 'VIGENTE',
    dataInicioEditavel: situacao === 'AGENDADO',
    criadoEm: produto.createdAt.toISOString(),
    atualizadoEm: produto.updatedAt.toISOString(),
    excluidoEm: produto.deletedAt ? produto.deletedAt.toISOString() : null,
  };
}
