import { Module, type OnModuleInit } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ExclusaoEmCascataFilialRegistry } from '../filiais/cascata/exclusao-em-cascata-filial.registry';
import { FiliaisModule } from '../filiais/filiais.module';
import { Produto } from '../produtos/models/produto.model';
import { CategoriasExclusaoCascata } from './cascata/categorias-exclusao-cascata';
import { CategoriasController } from './controllers/categorias.controller';
import { Categoria } from './models/categoria.model';
import { CategoriasService } from './services/categorias.service';

/** Registra também o model Produto: a exclusão de categoria conta e exclui os produtos dela (RN20). */
@Module({
  imports: [SequelizeModule.forFeature([Categoria, Produto]), FiliaisModule],
  controllers: [CategoriasController],
  providers: [CategoriasService, CategoriasExclusaoCascata],
  exports: [CategoriasService, SequelizeModule, FiliaisModule],
})
export class CategoriasModule implements OnModuleInit {
  constructor(
    private readonly registry: ExclusaoEmCascataFilialRegistry,
    private readonly cascata: CategoriasExclusaoCascata,
  ) {}

  onModuleInit(): void {
    this.registry.registrar(this.cascata);
  }
}
