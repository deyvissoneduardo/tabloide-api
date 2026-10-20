import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export type ResultadoCachePublico = 'hit' | 'miss' | 'negativo' | 'invalidado';

/** Registro próprio (não o global do prom-client): cada app de teste tem o seu. */
@Injectable()
export class MetricasService {
  readonly registro = new Registry();

  readonly duracaoHttp = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duração das requisições HTTP',
    labelNames: ['metodo', 'rota', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2],
    registers: [this.registro],
  });

  readonly cachePublico = new Counter({
    name: 'publico_cache_total',
    help: 'Leituras do cache da página pública por resultado',
    labelNames: ['resultado'],
    registers: [this.registro],
  });

  readonly entradasCachePublico = new Gauge({
    name: 'publico_cache_entradas',
    help: 'Entradas no cache da página pública',
    registers: [this.registro],
  });

  readonly poolEmUso = new Gauge({
    name: 'db_pool_em_uso',
    help: 'Conexões do pool em uso',
    registers: [this.registro],
  });

  readonly poolEspera = new Gauge({
    name: 'db_pool_espera',
    help: 'Requisições esperando conexão do pool',
    registers: [this.registro],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registro });
  }

  contarCache(resultado: ResultadoCachePublico): void {
    this.cachePublico.inc({ resultado });
  }

  async texto(): Promise<string> {
    return this.registro.metrics();
  }
}
