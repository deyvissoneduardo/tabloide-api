import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import type { Env } from '../../config/env.schema';
import { MidiaModule } from '../midia/midia.module';
import { ConfiguracaoPaginaController } from './controllers/configuracao-pagina.controller';
import { IdentidadeController } from './controllers/identidade.controller';
import { PainelLojistaController } from './controllers/painel-lojista.controller';
import { LojistaAtivacao } from './models/lojista-ativacao.model';
import { Lojista } from './models/lojista.model';
import { ConfiguracaoPaginaService } from './services/configuracao-pagina.service';
import { IdentidadeService } from './services/identidade.service';
import { LojistasService } from './services/lojistas.service';
import { SenhaService } from './services/senha.service';
import { StatusLojistaCache } from './services/status-lojista.cache';

@Module({
  imports: [SequelizeModule.forFeature([Lojista, LojistaAtivacao]), MidiaModule],
  controllers: [PainelLojistaController, IdentidadeController, ConfiguracaoPaginaController],
  providers: [
    LojistasService,
    SenhaService,
    IdentidadeService,
    ConfiguracaoPaginaService,
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
