import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import type { Env } from '../../config/env.schema';
import { PainelLojistaController } from './controllers/painel-lojista.controller';
import { LojistaAtivacao } from './models/lojista-ativacao.model';
import { Lojista } from './models/lojista.model';
import { LojistasService } from './services/lojistas.service';
import { SenhaService } from './services/senha.service';
import { StatusLojistaCache } from './services/status-lojista.cache';

@Module({
  imports: [SequelizeModule.forFeature([Lojista, LojistaAtivacao])],
  controllers: [PainelLojistaController],
  providers: [
    LojistasService,
    SenhaService,
    {
      provide: StatusLojistaCache,
      inject: [ConfigService, LojistasService],
      useFactory: (config: ConfigService<Env, true>, lojistas: LojistasService) =>
        new StatusLojistaCache(config.get('TENANT_STATUS_CACHE_TTL_MS', { infer: true }), (tenantId) =>
          lojistas.obterStatus(tenantId),
        ),
    },
  ],
  exports: [LojistasService, SenhaService, StatusLojistaCache],
})
export class LojistasModule {}
