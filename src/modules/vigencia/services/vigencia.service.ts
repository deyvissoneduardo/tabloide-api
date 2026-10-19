import { Injectable } from '@nestjs/common';
import { ClockService } from '../../../common/clock/clock.service';
import { hojeNoFuso } from '../../../common/utils/date-only';
import { calcularSituacao } from '../domain/situacao';
import type { DataISO, ItemComVigencia, Situacao } from '../domain/vigencia.types';

interface ComFuso {
  fusoHorario: string;
}

@Injectable()
export class VigenciaService {
  constructor(private readonly clock: ClockService) {}

  /** Lê o relógio uma vez. Quem avalia vários itens da mesma filial deve reaproveitar o resultado. */
  hojeDaFilial(filial: ComFuso): DataISO {
    return hojeNoFuso(filial.fusoHorario, this.clock.agora());
  }

  situacaoDe(item: ItemComVigencia, filial: ComFuso): Situacao {
    return calcularSituacao(item, this.hojeDaFilial(filial));
  }
}
