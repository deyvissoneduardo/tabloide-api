import { Module, type OnModuleInit } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ExclusaoEmCascataFilialRegistry } from '../filiais/cascata/exclusao-em-cascata-filial.registry';
import { FiliaisModule } from '../filiais/filiais.module';
import { MidiaModule } from '../midia/midia.module';
import { PanfletosExclusaoCascata } from './cascata/panfletos-exclusao-cascata';
import { PanfletosController } from './controllers/panfletos.controller';
import { Panfleto } from './models/panfleto.model';
import { PanfletosService } from './services/panfletos.service';

@Module({
  imports: [SequelizeModule.forFeature([Panfleto]), FiliaisModule, MidiaModule],
  controllers: [PanfletosController],
  providers: [PanfletosService, PanfletosExclusaoCascata],
  exports: [SequelizeModule],
})
export class PanfletosModule implements OnModuleInit {
  constructor(
    private readonly registry: ExclusaoEmCascataFilialRegistry,
    private readonly cascata: PanfletosExclusaoCascata,
  ) {}

  onModuleInit(): void {
    this.registry.registrar(this.cascata);
  }
}
