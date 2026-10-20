import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminKeyGuard } from '../../../common/guards/admin-key.guard';
import { MetricasService } from '../../../common/observabilidade/metricas.service';

interface PoolSequelize {
  using?: number;
  waiting?: number;
}

/** Texto Prometheus atrás da chave de admin; sem a chave, o mesmo 404 das rotas admin. */
@Public()
@UseGuards(AdminKeyGuard)
@Controller('admin/metricas')
export class AdminMetricasController {
  constructor(
    private readonly metricas: MetricasService,
    private readonly sequelize: Sequelize,
  ) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async obter(): Promise<string> {
    const pool = (this.sequelize.connectionManager as unknown as { pool?: PoolSequelize }).pool;
    this.metricas.poolEmUso.set(pool?.using ?? 0);
    this.metricas.poolEspera.set(pool?.waiting ?? 0);
    return this.metricas.texto();
  }
}
