import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MidiaModule } from '../midia/midia.module';
import { RegistroAcessoPainelInterceptor } from './interceptors/registro-acesso-painel.interceptor';
import { ExportacaoDadosService } from './services/exportacao-dados.service';
import { RegistroAcessoPainelService } from './services/registro-acesso-painel.service';

/** LGPD e Marco Civil: registros de acesso ao painel e exportação dos dados do lojista. */
@Module({
  imports: [MidiaModule],
  providers: [
    RegistroAcessoPainelService,
    ExportacaoDadosService,
    { provide: APP_INTERCEPTOR, useClass: RegistroAcessoPainelInterceptor },
  ],
  exports: [RegistroAcessoPainelService, ExportacaoDadosService],
})
export class PrivacidadeModule {}
