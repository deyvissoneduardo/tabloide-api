import { Global, Module } from '@nestjs/common';
import { SemLimitesVerificador, VERIFICADOR_LIMITES } from './verificador-limites';

@Global()
@Module({
  providers: [{ provide: VERIFICADOR_LIMITES, useClass: SemLimitesVerificador }],
  exports: [VERIFICADOR_LIMITES],
})
export class LimitesModule {}
