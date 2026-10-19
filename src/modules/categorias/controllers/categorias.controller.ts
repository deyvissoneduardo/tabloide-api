import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { TenantId } from '../../../common/decorators/tenant-id.decorator';
import { ParseUuidOu404Pipe } from '../../../common/pipes/parse-uuid-ou-404.pipe';
import { CriarCategoriaDto } from '../dtos/criar-categoria.dto';
import { RenomearCategoriaDto } from '../dtos/renomear-categoria.dto';
import { CategoriasService } from '../services/categorias.service';
import type { CategoriaView } from '../views/categoria.view';

@Controller('painel/filiais/:filialId/categorias')
export class CategoriasController {
  constructor(private readonly categorias: CategoriasService) {}

  /** Poucas por filial: sem paginação, em ordem alfabética. */
  @Get()
  async listar(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
  ): Promise<{ itens: CategoriaView[] }> {
    return { itens: await this.categorias.listar(tenantId, filialId) };
  }

  @Post()
  criar(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Body() dto: CriarCategoriaDto,
  ): Promise<CategoriaView> {
    return this.categorias.criar(tenantId, filialId, dto);
  }

  @Patch(':categoriaId')
  renomear(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('categoriaId', ParseUuidOu404Pipe) categoriaId: string,
    @Body() dto: RenomearCategoriaDto,
  ): Promise<CategoriaView> {
    return this.categorias.renomear(tenantId, filialId, categoriaId, dto);
  }

  @Delete(':categoriaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async excluir(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('categoriaId', ParseUuidOu404Pipe) categoriaId: string,
  ): Promise<void> {
    await this.categorias.excluir(tenantId, filialId, categoriaId);
  }
}
