import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { v7 as uuidv7 } from 'uuid';
import { ClockService } from '../../../common/clock/clock.service';
import { LogErro } from '../models/log-erro.model';

export const MAX_MENSAGEM = 2000;
export const MAX_STACK = 10_000;
export const MAX_ROTA = 500;

export interface ContextoDoErro {
  requestId?: string | null;
  metodo?: string | null;
  /** URL original; a query string é descartada (pode ter dados do usuário). */
  url?: string | null;
}

const cortar = (texto: string | null | undefined, max: number): string | null =>
  texto ? texto.slice(0, max) : null;

@Injectable()
export class LogsErroService {
  constructor(
    @InjectModel(LogErro) private readonly model: typeof LogErro,
    private readonly clock: ClockService,
  ) {}

  async registrar(exception: unknown, contexto: ContextoDoErro): Promise<void> {
    const erro = exception instanceof Error ? exception : null;
    await this.model.create(
      {
        id: uuidv7(),
        ocorridoEm: this.clock.agora(),
        requestId: cortar(contexto.requestId, 64),
        metodo: cortar(contexto.metodo, 10),
        rota: cortar(contexto.url?.split('?')[0], MAX_ROTA),
        tipo: cortar(erro?.name ?? typeof exception, 100),
        mensagem: cortar(erro ? erro.message : String(exception), MAX_MENSAGEM) ?? '',
        stack: cortar(erro?.stack, MAX_STACK),
      },
      { returning: false },
    );
  }
}
