import { BeforeApplicationShutdown, Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app.config';

const esperar = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

/**
 * Desligamento gracioso: ao receber o sinal, a readiness passa a 503 e esperamos o load
 * balancer parar de mandar tráfego. Depois o Nest fecha o servidor HTTP (drenando o que está
 * em andamento) e o pool do Sequelize, nessa ordem.
 */
@Injectable()
export class DesligamentoService implements BeforeApplicationShutdown {
  private desligando = false;

  constructor(private readonly config: AppConfig) {}

  get emDesligamento(): boolean {
    return this.desligando;
  }

  async beforeApplicationShutdown(sinal?: string): Promise<void> {
    this.desligando = true;
    // app.close() sem sinal (testes, scripts) não precisa esperar o load balancer
    const { drenagemMs } = this.config.desligamento;
    if (sinal && drenagemMs > 0) await esperar(drenagemMs);
  }
}
