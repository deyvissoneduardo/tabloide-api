import { Injectable } from '@nestjs/common';
import { ClockService } from '../../../common/clock/clock.service';
import { naoEncontrado } from '../../../common/errors/errors';
import { hojeNoFuso, type DataISO } from '../../../common/utils/date-only';
import { AppConfig } from '../../../config/app.config';
import { montarResumo, type ResumoAcessos } from '../domain/montar-resumo';
import {
  garantirPeriodoValido,
  intervaloDaFilial,
  lerPeriodo,
  type Intervalo,
} from '../domain/periodo-relatorio';
import type { ResumoAcessosQueryDto } from '../dtos/resumo-acessos-query.dto';
import { AcessosQuery, type IntervaloDeFilial } from './acessos.query';

const maior = (datas: DataISO[]): DataISO => datas.reduce((a, b) => (b > a ? b : a));
const menor = (datas: DataISO[]): DataISO => datas.reduce((a, b) => (b < a ? b : a));

/** GET /v1/painel/acessos: resumo do lojista (RN53, RN54, RN57). */
@Injectable()
export class ResumoAcessosService {
  constructor(
    private readonly query: AcessosQuery,
    private readonly clock: ClockService,
    private readonly config: AppConfig,
  ) {}

  async resumo(tenantId: string, q: ResumoAcessosQueryDto): Promise<ResumoAcessos> {
    const periodo = lerPeriodo(q);
    const agora = this.clock.agora();
    const filiais = await this.query.filiaisDoLojista(tenantId);
    // RN57: a filial excluída do próprio lojista é aceita, para ver o histórico dela
    if (q.filialId !== undefined && !filiais.some((f) => f.id === q.filialId)) throw naoEncontrado();

    const hojePorFilial = new Map(filiais.map((f) => [f.id, hojeNoFuso(f.fusoHorario, agora)]));
    const ativas = filiais.filter((f) => f.deletedAt === null);
    const hojeDoLojista =
      ativas.length > 0
        ? maior(ativas.map((f) => hojePorFilial.get(f.id)!))
        : hojeNoFuso(this.config.fusoHorarioPadrao, agora);
    garantirPeriodoValido(periodo, hojeDoLojista);

    const intervalos: IntervaloDeFilial[] = filiais.map((f) => ({
      filialId: f.id,
      ...intervaloDaFilial(periodo, hojePorFilial.get(f.id)!),
    }));
    const doFiltro =
      q.filialId === undefined ? intervalos : intervalos.filter((i) => i.filialId === q.filialId);
    const intervalo: Intervalo =
      doFiltro.length > 0
        ? { inicio: menor(doFiltro.map((i) => i.inicio)), fim: maior(doFiltro.map((i) => i.fim)) }
        : intervaloDaFilial(periodo, hojeDoLojista);

    const [totaisPorFilial, agregados, iniciosPanfleto] = await Promise.all([
      this.query.totaisPorFilial(tenantId, intervalos),
      this.query.agregados(tenantId, doFiltro, q.filialId),
      this.query.iniciosPanfleto(tenantId, intervalo, q.filialId),
    ]);

    return montarResumo({
      intervalo,
      filiais: filiais.map((f) => ({ id: f.id, nome: f.nome, excluida: f.deletedAt !== null })),
      totaisPorFilial,
      ...agregados,
      iniciosPanfleto,
    });
  }
}
