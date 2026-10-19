import { Module, type OnModuleInit } from '@nestjs/common';
import { CategoriasModule } from '../categorias/categorias.module';
import { ExclusaoEmCascataFilialRegistry } from '../filiais/cascata/exclusao-em-cascata-filial.registry';
import { MidiaModule } from '../midia/midia.module';
import { ProdutosExclusaoCascata } from './cascata/produtos-exclusao-cascata';
import { ProdutosController } from './controllers/produtos.controller';
import { ProdutoFotoService } from './services/produto-foto.service';
import { ProdutosService } from './services/produtos.service';

/**
 * Os models Produto e Categoria vêm do CategoriasModule; filiais, vigência e auditoria
 * chegam reexportados pelo FiliaisModule. O limite de produtos é o token global da Fase 2.
 */
@Module({
  imports: [CategoriasModule, MidiaModule],
  controllers: [ProdutosController],
  providers: [ProdutosService, ProdutoFotoService, ProdutosExclusaoCascata],
})
export class ProdutosModule implements OnModuleInit {
  constructor(
    private readonly registry: ExclusaoEmCascataFilialRegistry,
    private readonly cascata: ProdutosExclusaoCascata,
  ) {}

  onModuleInit(): void {
    this.registry.registrar(this.cascata);
  }
}
