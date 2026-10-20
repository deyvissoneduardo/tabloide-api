import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Sequelize } from 'sequelize-typescript';
import { Public } from '../../../common/decorators/public.decorator';
import { DesligamentoService } from '../../../common/observabilidade/desligamento.service';

export const TIMEOUT_PING_BANCO_MS = 1000;

/** Sem rate limit nem log de acesso (logger.config). Sem CORS (http.config). */
@Public()
@Controller('saude')
export class SaudeController {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly desligamento: DesligamentoService,
  ) {}

  /** Liveness: só o processo; não depende do banco, para o container não reiniciar à toa. */
  @Get('vivo')
  vivo(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: banco respondendo em até 1 s e o processo fora do desligamento. */
  @Get('pronto')
  async pronto(@Res() res: Response): Promise<void> {
    if (this.desligamento.emDesligamento) {
      res.status(503).json({ status: 'erro', info: { desligamento: { status: 'em andamento' } } });
      return;
    }
    const bancoOk = await this.pingBanco();
    res
      .status(bancoOk ? 200 : 503)
      .json({ status: bancoOk ? 'ok' : 'erro', info: { banco: { status: bancoOk ? 'up' : 'down' } } });
  }

  private async pingBanco(): Promise<boolean> {
    let temporizador: NodeJS.Timeout | undefined;
    const limite = new Promise<never>((_, rejeitar) => {
      temporizador = setTimeout(() => rejeitar(new Error('timeout')), TIMEOUT_PING_BANCO_MS);
    });
    try {
      await Promise.race([this.sequelize.query('SELECT 1'), limite]);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(temporizador);
    }
  }
}
