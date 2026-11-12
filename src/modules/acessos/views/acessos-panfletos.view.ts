import { ApiProperty } from '@nestjs/swagger';
import { ApiDataISO } from '../../../common/swagger/data-iso.decorator';
import type { DataISO } from '../../../common/utils/date-only';
import type { AcessosDoPanfleto, SituacaoAcessosPanfleto } from '../domain/vigencia-efetiva-panfleto';

export class AcessosDoPanfletoView {
  panfletoId!: string;
  @ApiDataISO()
  dataInicio!: DataISO;
  @ApiDataISO({ anulavel: true })
  dataLimite!: DataISO | null;
  /** Fim da vigência efetiva: menor entre data limite, data da exclusão e hoje. */
  @ApiDataISO()
  dataFimContagem!: DataISO;
  @ApiProperty({ enum: ['VIGENTE', 'VENCIDO', 'EXCLUIDO'] })
  situacao!: SituacaoAcessosPanfleto;
  /** Soma da vigência efetiva inteira, não só do filtro (RN55). */
  totalAcessos!: number;
  dias!: number;
  /** Uma casa decimal. */
  mediaPorDia!: number;
}

export class AcessosPanfletosView {
  itens!: AcessosDoPanfletoView[];
}

export function acessosPanfletosView(itens: AcessosDoPanfleto[]): AcessosPanfletosView {
  return {
    itens: itens.map((i) => ({
      panfletoId: i.panfletoId,
      dataInicio: i.dataInicio,
      dataLimite: i.dataLimite,
      dataFimContagem: i.dataFimContagem,
      situacao: i.situacao,
      totalAcessos: i.totalAcessos,
      dias: i.dias,
      mediaPorDia: i.mediaPorDia,
    })),
  };
}
