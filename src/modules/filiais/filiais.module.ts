import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { VigenciaModule } from '../vigencia/vigencia.module';
import { ExclusaoEmCascataFilialRegistry } from './cascata/exclusao-em-cascata-filial.registry';
import { FiliaisController } from './controllers/filiais.controller';
import { FilialEndereco } from './models/filial-endereco.model';
import { Filial } from './models/filial.model';
import { FiliaisService } from './services/filiais.service';
import { GERADOR_CODIGO_PUBLICO, NanoidGeradorCodigoPublico } from './services/gerador-codigo-publico';
import { QrCodeService } from './services/qrcode.service';

@Module({
  imports: [SequelizeModule.forFeature([Filial, FilialEndereco]), AuditoriaModule, VigenciaModule],
  controllers: [FiliaisController],
  providers: [
    FiliaisService,
    QrCodeService,
    ExclusaoEmCascataFilialRegistry,
    { provide: GERADOR_CODIGO_PUBLICO, useClass: NanoidGeradorCodigoPublico },
  ],
  exports: [
    FiliaisService,
    ExclusaoEmCascataFilialRegistry,
    SequelizeModule,
    AuditoriaModule,
    VigenciaModule,
  ],
})
export class FiliaisModule {}
