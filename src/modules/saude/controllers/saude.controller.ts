import { Controller, Get, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Sequelize } from 'sequelize-typescript';
import { Public } from '../../../common/decorators/public.decorator';
import { DesligamentoService } from '../../../common/observabilidade/desligamento.service';

export const TIMEOUT_PING_BANCO_MS = 1000;

const SCHEMA_PRONTO = {
  type: 'object' as const,
  properties: {
    status: { type: 'string', enum: ['ok', 'erro'] },
    info: { type: 'object', additionalProperties: true, example: { banco: { status: 'up' } } },
  },
};

/** Sem rate limit nem log de acesso (logger.config). Sem CORS (http.config). */
@ApiTags('Saúde')
@Public()
@Controller('saude')
export class SaudeController {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly desligamento: DesligamentoService,
  ) {}

  /** Liveness: só o processo; não depende do banco, para o container não reiniciar à toa. */
  @Get('vivo')
  @ApiOperation({ summary: 'Liveness' })
  @ApiOkResponse({ schema: { type: 'object', properties: { status: { type: 'string', enum: ['ok'] } } } })
  vivo(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: banco respondendo em até 1 s e o processo fora do desligamento. */
  @Get('pronto')
  @ApiOperation({ summary: 'Readiness: banco e desligamento' })
  @ApiOkResponse({ schema: SCHEMA_PRONTO })
  @ApiServiceUnavailableResponse({ schema: SCHEMA_PRONTO })
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
