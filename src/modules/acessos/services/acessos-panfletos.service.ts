import { Injectable } from '@nestjs/common';
import { ClockService } from '../../../common/clock/clock.service';
import { diasEntre, hojeNoFuso } from '../../../common/utils/date-only';
import { FiliaisService } from '../../filiais/services/filiais.service';
import { garantirPeriodoValido, intervaloDaFilial, lerPeriodo } from '../domain/periodo-relatorio';
import { cruzaIntervalo, vigenciaEfetiva, type AcessosDoPanfleto } from '../domain/vigencia-efetiva-panfleto';
import type { PeriodoAcessosQueryDto } from '../dtos/periodo-acessos-query.dto';
import { AcessosQuery } from './acessos.query';

/** GET /v1/painel/filiais/:filialId/acessos/panfletos (RN55, RN56). */
@Injectable()
export class AcessosPanfletosService {
  constructor(
    private readonly query: AcessosQuery,
    private readonly filiais: FiliaisService,
    private readonly clock: ClockService,
  ) {}

  async listar(tenantId: string, filialId: string, q: PeriodoAcessosQueryDto): Promise<AcessosDoPanfleto[]> {
    const periodo = lerPeriodo(q);
    // 404 para filial de outro lojista, inexistente ou excluída
    const filial = await this.filiais.obter(tenantId, filialId);
    const agora = this.clock.agora();
    const hoje = hojeNoFuso(filial.fusoHorario, agora);
    garantirPeriodoValido(periodo, hoje);
    const filtro = intervaloDaFilial(periodo, hoje);

    const panfletos = await this.query.panfletosDaFilial(tenantId, filialId, hoje);
    const vigentes = panfletos.flatMap((p) => {
      const dataExclusao = p.deletedAt ? hojeNoFuso(filial.fusoHorario, p.deletedAt) : null;
      const v = vigenciaEfetiva({ dataInicio: p.dataInicio, dataLimite: p.dataLimite, dataExclusao }, hoje);
      return v && cruzaIntervalo(v, filtro) ? [{ panfleto: p, vigencia: v }] : [];
    });

    // RN55: soma a vigência efetiva inteira, não só o filtro, para comparar panfletos com justiça
    const totais = await this.query.somaPorIntervalos(
      tenantId,
      filialId,
      vigentes.map(({ panfleto, vigencia }) => ({
        panfletoId: panfleto.id,
        inicio: vigencia.inicio,
        fim: vigencia.fim,
      })),
    );

    return vigentes
      .map(({ panfleto, vigencia }) => {
        const totalAcessos = totais.get(panfleto.id) ?? 0;
        const dias = diasEntre(vigencia.inicio, vigencia.fim) + 1;
        return {
          panfletoId: panfleto.id,
          dataInicio: panfleto.dataInicio,
          dataLimite: panfleto.dataLimite,
          dataFimContagem: vigencia.fim,
          situacao: vigencia.situacao,
          totalAcessos,
          dias,
          mediaPorDia: Math.round((totalAcessos / dias) * 10) / 10,
        };
      })
      .sort((a, b) => (a.dataInicio < b.dataInicio ? 1 : a.dataInicio > b.dataInicio ? -1 : 0));
  }
}
