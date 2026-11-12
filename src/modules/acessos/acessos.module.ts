import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { FiliaisModule } from '../filiais/filiais.module';
import { AcessosPanfletosController } from './controllers/acessos-panfletos.controller';
import { AcessosController } from './controllers/acessos.controller';
import { AcessoFilial } from './models/acesso-filial.model';
import { AcessosPanfletosService } from './services/acessos-panfletos.service';
import { AcessosQuery } from './services/acessos.query';
import { RegistroAcessosService } from './services/registro-acessos.service';
import { ResumoAcessosService } from './services/resumo-acessos.service';

/** Painel de acessos (RN50–RN58): contagem na página pública e indicadores no painel. */
@Module({
  imports: [SequelizeModule.forFeature([AcessoFilial]), FiliaisModule],
  controllers: [AcessosController, AcessosPanfletosController],
  providers: [RegistroAcessosService, AcessosQuery, ResumoAcessosService, AcessosPanfletosService],
  exports: [RegistroAcessosService],
})
export class AcessosModule {}
