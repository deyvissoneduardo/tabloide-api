import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import type { Pagina } from '../../../common/dtos/paginacao-query.dto';
import { TenantId } from '../../../common/decorators/tenant-id.decorator';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { ParseUuidOu404Pipe } from '../../../common/pipes/parse-uuid-ou-404.pipe';
import { ApiParamUuid } from '../../../common/swagger/parametros.decorator';
import {
  ApiPainel,
  ApiRespostaPaginada,
  ApiRespostasDeErro,
} from '../../../common/swagger/respostas.decorator';
import { ApiUpload } from '../../midia/interceptors/api-upload.decorator';
import {
  CAMPO_FOTO,
  UploadFotoInterceptor,
  UploadFotoOpcionalInterceptor,
} from '../../midia/interceptors/upload-imagem.interceptor';
import { CriarProdutoDto } from '../dtos/criar-produto.dto';
import { EditarProdutoDto } from '../dtos/editar-produto.dto';
import { ListarProdutosQueryDto } from '../dtos/listar-produtos-query.dto';
import { ProdutoFotoService } from '../services/produto-foto.service';
import { ProdutosService } from '../services/produtos.service';
import { ProdutoView } from '../views/produto.view';

@ApiPainel('Produtos')
@ApiParamUuid('filialId')
@Controller('painel/filiais/:filialId/produtos')
export class ProdutosController {
  constructor(
    private readonly produtos: ProdutosService,
    private readonly fotos: ProdutoFotoService,
  ) {}

  /** JSON sem foto ou multipart com a foto opcional no campo "foto" (D4.1). */
  @Post()
  @UseInterceptors(UploadFotoOpcionalInterceptor)
  @ApiOperation({ summary: 'Cria produto com preço em centavos e vigência (RN19, RN21)' })
  @ApiUpload({ campo: CAMPO_FOTO, obrigatorio: false, dto: CriarProdutoDto, aceitaJson: true })
  @ApiRespostasDeErro(
    CodigoErro.VALIDACAO_INVALIDA,
    CodigoErro.RECURSO_NAO_ENCONTRADO,
    CodigoErro.PRECO_ORIGINAL_INVALIDO,
    CodigoErro.DATA_INICIO_INVALIDA,
    CodigoErro.DATA_LIMITE_INVALIDA,
    CodigoErro.LIMITE_DO_PLANO_ATINGIDO,
    CodigoErro.LOJISTA_DESATIVADO,
    CodigoErro.IMAGEM_INVALIDA,
    CodigoErro.IMAGEM_MUITO_GRANDE,
    CodigoErro.ARMAZENAMENTO_INDISPONIVEL,
  )
  criar(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Body() dto: CriarProdutoDto,
    @UploadedFile() foto?: Express.Multer.File,
  ): Promise<ProdutoView> {
    return this.produtos.criar(tenantId, filialId, dto, foto?.buffer);
  }

  @Get()
  @ApiOperation({ summary: 'Lista produtos da filial, com filtros' })
  @ApiRespostaPaginada(ProdutoView)
  @ApiRespostasDeErro(CodigoErro.VALIDACAO_INVALIDA, CodigoErro.RECURSO_NAO_ENCONTRADO)
  listar(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Query() query: ListarProdutosQueryDto,
  ): Promise<Pagina<ProdutoView>> {
    return this.produtos.listar(tenantId, filialId, query);
  }

  @Get(':produtoId')
  @ApiOperation({ summary: 'Detalha um produto' })
  @ApiParamUuid('produtoId')
  @ApiRespostasDeErro(CodigoErro.RECURSO_NAO_ENCONTRADO)
  obter(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('produtoId', ParseUuidOu404Pipe) produtoId: string,
  ): Promise<ProdutoView> {
    return this.produtos.obter(tenantId, filialId, produtoId);
  }

  @Patch(':produtoId')
  @ApiOperation({ summary: 'Edita o produto; preços e datas são auditados (RN26, RNF07)' })
  @ApiParamUuid('produtoId')
  @ApiRespostasDeErro(
    CodigoErro.VALIDACAO_INVALIDA,
    CodigoErro.RECURSO_NAO_ENCONTRADO,
    CodigoErro.ITEM_NAO_EDITAVEL,
    CodigoErro.DATA_INICIO_IMUTAVEL,
    CodigoErro.DATA_INICIO_INVALIDA,
    CodigoErro.DATA_LIMITE_INVALIDA,
    CodigoErro.PRECO_ORIGINAL_INVALIDO,
    CodigoErro.LOJISTA_DESATIVADO,
  )
  editar(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('produtoId', ParseUuidOu404Pipe) produtoId: string,
    @Body() dto: EditarProdutoDto,
  ): Promise<ProdutoView> {
    return this.produtos.editar(tenantId, filialId, produtoId, dto);
  }

  @Delete(':produtoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui o produto (exclusão lógica)' })
  @ApiParamUuid('produtoId')
  @ApiRespostasDeErro(
    CodigoErro.RECURSO_NAO_ENCONTRADO,
    CodigoErro.ITEM_NAO_EDITAVEL,
    CodigoErro.LOJISTA_DESATIVADO,
  )
  async excluir(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('produtoId', ParseUuidOu404Pipe) produtoId: string,
  ): Promise<void> {
    await this.produtos.excluir(tenantId, filialId, produtoId);
  }

  @Put(':produtoId/foto')
  @UseInterceptors(UploadFotoInterceptor)
  @ApiOperation({ summary: 'Substitui a foto do produto' })
  @ApiParamUuid('produtoId')
  @ApiUpload({ campo: CAMPO_FOTO, obrigatorio: true })
  @ApiRespostasDeErro(
    CodigoErro.VALIDACAO_INVALIDA,
    CodigoErro.RECURSO_NAO_ENCONTRADO,
    CodigoErro.ITEM_NAO_EDITAVEL,
    CodigoErro.LOJISTA_DESATIVADO,
    CodigoErro.IMAGEM_INVALIDA,
    CodigoErro.IMAGEM_MUITO_GRANDE,
    CodigoErro.ARMAZENAMENTO_INDISPONIVEL,
  )
  substituirFoto(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('produtoId', ParseUuidOu404Pipe) produtoId: string,
    @UploadedFile() foto: Express.Multer.File,
  ): Promise<ProdutoView> {
    return this.fotos.substituir(tenantId, filialId, produtoId, foto.buffer);
  }

  @Delete(':produtoId/foto')
  @ApiOperation({ summary: 'Remove a foto do produto' })
  @ApiParamUuid('produtoId')
  @ApiRespostasDeErro(
    CodigoErro.RECURSO_NAO_ENCONTRADO,
    CodigoErro.ITEM_NAO_EDITAVEL,
    CodigoErro.LOJISTA_DESATIVADO,
  )
  removerFoto(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('produtoId', ParseUuidOu404Pipe) produtoId: string,
  ): Promise<ProdutoView> {
    return this.fotos.remover(tenantId, filialId, produtoId);
  }
}
