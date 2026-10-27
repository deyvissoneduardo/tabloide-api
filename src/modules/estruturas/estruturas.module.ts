import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Categoria } from '../categorias/models/categoria.model';
import { FiliaisModule } from '../filiais/filiais.module';
import { MidiaModule } from '../midia/midia.module';
import { Produto } from '../produtos/models/produto.model';
import { EstruturaController } from './controllers/estrutura.controller';
import { EstruturaService } from './services/estrutura.service';

/** RN45: ordem da página pública por filial. O FiliaisModule reexporta o VigenciaModule. */
@Module({
  imports: [SequelizeModule.forFeature([Categoria, Produto]), FiliaisModule, MidiaModule],
  controllers: [EstruturaController],
  providers: [EstruturaService],
})
export class EstruturasModule {}
