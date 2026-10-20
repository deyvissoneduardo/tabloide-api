import { Global, Module } from '@nestjs/common';
import { DesligamentoService } from './desligamento.service';
import { MetricasService } from './metricas.service';

@Global()
@Module({
  providers: [MetricasService, DesligamentoService],
  exports: [MetricasService, DesligamentoService],
})
export class ObservabilidadeModule {}
