import { Global, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { LojistaLimite } from '../../modules/limites/models/lojista-limite.model';
import { LimitesService } from '../../modules/limites/services/limites.service';
import { VERIFICADOR_LIMITES } from './verificador-limites';

/** Fase 5: o LimitesService (RNF12) substitui o SemLimitesVerificador; nenhum consumidor muda. */
@Global()
@Module({
  imports: [SequelizeModule.forFeature([LojistaLimite])],
  providers: [LimitesService, { provide: VERIFICADOR_LIMITES, useExisting: LimitesService }],
  exports: [VERIFICADOR_LIMITES],
})
export class LimitesModule {}
