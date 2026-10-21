import { ApiDataISO } from '../../../common/swagger/data-iso.decorator';
import type { DataISO } from '../../../common/utils/date-only';
import { calcularSituacao } from '../../vigencia/domain/situacao';
import type { Situacao } from '../../vigencia/domain/vigencia.types';
import type { Panfleto } from '../models/panfleto.model';

export class PanfletoView {
  id!: string;
  filialId!: string;
  urlImagem!: string;
  largura!: number;
  altura!: number;
  @ApiDataISO()
  dataInicio!: DataISO;
  @ApiDataISO({ anulavel: true })
  dataLimite!: DataISO | null;
  situacao!: Situacao;
  editavel!: boolean;
  criadoEm!: string;
  excluidoEm!: string | null;
}

/**
 * hoje é calculado uma vez por request, no fuso da filial. largura e altura deixam o front
 * reservar o espaço da imagem (RNF02). Nunca expõe imagemPath nem tenantId.
 */
export function panfletoView(panfleto: Panfleto, hoje: DataISO, urlImagem: string): PanfletoView {
  const situacao = calcularSituacao(
    {
      dataInicio: panfleto.dataInicio,
      dataLimite: panfleto.dataLimite,
      deletedAt: panfleto.deletedAt ?? null,
    },
    hoje,
  );
  return {
    id: panfleto.id,
    filialId: panfleto.filialId,
    urlImagem,
    largura: panfleto.imagemLargura,
    altura: panfleto.imagemAltura,
    dataInicio: panfleto.dataInicio,
    dataLimite: panfleto.dataLimite,
    situacao,
    editavel: situacao === 'AGENDADO' || situacao === 'VIGENTE',
    criadoEm: panfleto.createdAt.toISOString(),
    excluidoEm: panfleto.deletedAt ? panfleto.deletedAt.toISOString() : null,
  };
}
