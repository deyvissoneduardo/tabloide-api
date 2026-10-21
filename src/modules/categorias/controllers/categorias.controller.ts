import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiOperation, getSchemaPath } from '@nestjs/swagger';
import { TenantId } from '../../../common/decorators/tenant-id.decorator';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { ParseUuidOu404Pipe } from '../../../common/pipes/parse-uuid-ou-404.pipe';
import { ApiParamUuid } from '../../../common/swagger/parametros.decorator';
import { ApiPainel, ApiRespostasDeErro } from '../../../common/swagger/respostas.decorator';
import { CriarCategoriaDto } from '../dtos/criar-categoria.dto';
import { RenomearCategoriaDto } from '../dtos/renomear-categoria.dto';
import { CategoriasService } from '../services/categorias.service';
import { CategoriaView } from '../views/categoria.view';

@ApiPainel('Categorias')
@ApiParamUuid('filialId')
@ApiExtraModels(CategoriaView)
@Controller('painel/filiais/:filialId/categorias')
export class CategoriasController {
  constructor(private readonly categorias: CategoriasService) {}

  /** Poucas por filial: sem paginação, em ordem alfabética. */
  @Get()
  @ApiOperation({ summary: 'Lista as categorias da filial, com contagem de produtos' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['itens'],
      properties: { itens: { type: 'array', items: { $ref: getSchemaPath(CategoriaView) } } },
    },
  })
  @ApiRespostasDeErro(CodigoErro.RECURSO_NAO_ENCONTRADO)
  async listar(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
  ): Promise<{ itens: CategoriaView[] }> {
    return { itens: await this.categorias.listar(tenantId, filialId) };
  }

  @Post()
  @ApiOperation({ summary: 'Cria categoria (nome único na filial, RN18)' })
  @ApiRespostasDeErro(
    CodigoErro.VALIDACAO_INVALIDA,
    CodigoErro.RECURSO_NAO_ENCONTRADO,
    CodigoErro.CATEGORIA_JA_EXISTE,
    CodigoErro.LOJISTA_DESATIVADO,
  )
  criar(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Body() dto: CriarCategoriaDto,
  ): Promise<CategoriaView> {
    return this.categorias.criar(tenantId, filialId, dto);
  }

  @Patch(':categoriaId')
  @ApiOperation({ summary: 'Renomeia a categoria' })
  @ApiParamUuid('categoriaId')
  @ApiRespostasDeErro(
    CodigoErro.VALIDACAO_INVALIDA,
    CodigoErro.RECURSO_NAO_ENCONTRADO,
    CodigoErro.CATEGORIA_JA_EXISTE,
    CodigoErro.LOJISTA_DESATIVADO,
  )
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
  @ApiOperation({ summary: 'Exclui a categoria sem produtos vigentes ou agendados (RN20)' })
  @ApiParamUuid('categoriaId')
  @ApiRespostasDeErro(
    CodigoErro.RECURSO_NAO_ENCONTRADO,
    CodigoErro.CATEGORIA_COM_PRODUTOS_ATIVOS,
    CodigoErro.LOJISTA_DESATIVADO,
  )
  async excluir(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('categoriaId', ParseUuidOu404Pipe) categoriaId: string,
  ): Promise<void> {
    await this.categorias.excluir(tenantId, filialId, categoriaId);
  }
}
