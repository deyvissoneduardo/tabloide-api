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
import type { Pagina } from '../../../common/dtos/paginacao-query.dto';
import { TenantId } from '../../../common/decorators/tenant-id.decorator';
import { ParseUuidOu404Pipe } from '../../../common/pipes/parse-uuid-ou-404.pipe';
import {
  UploadFotoInterceptor,
  UploadFotoOpcionalInterceptor,
} from '../../midia/interceptors/upload-imagem.interceptor';
import { CriarProdutoDto } from '../dtos/criar-produto.dto';
import { EditarProdutoDto } from '../dtos/editar-produto.dto';
import { ListarProdutosQueryDto } from '../dtos/listar-produtos-query.dto';
import { ProdutoFotoService } from '../services/produto-foto.service';
import { ProdutosService } from '../services/produtos.service';
import type { ProdutoView } from '../views/produto.view';

@Controller('painel/filiais/:filialId/produtos')
export class ProdutosController {
  constructor(
    private readonly produtos: ProdutosService,
    private readonly fotos: ProdutoFotoService,
  ) {}

  /** JSON sem foto ou multipart com a foto opcional no campo "foto" (D4.1). */
  @Post()
  @UseInterceptors(UploadFotoOpcionalInterceptor)
  criar(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Body() dto: CriarProdutoDto,
    @UploadedFile() foto?: Express.Multer.File,
  ): Promise<ProdutoView> {
    return this.produtos.criar(tenantId, filialId, dto, foto?.buffer);
  }

  @Get()
  listar(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Query() query: ListarProdutosQueryDto,
  ): Promise<Pagina<ProdutoView>> {
    return this.produtos.listar(tenantId, filialId, query);
  }

  @Get(':produtoId')
  obter(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('produtoId', ParseUuidOu404Pipe) produtoId: string,
  ): Promise<ProdutoView> {
    return this.produtos.obter(tenantId, filialId, produtoId);
  }

  @Patch(':produtoId')
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
  async excluir(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('produtoId', ParseUuidOu404Pipe) produtoId: string,
  ): Promise<void> {
    await this.produtos.excluir(tenantId, filialId, produtoId);
  }

  @Put(':produtoId/foto')
  @UseInterceptors(UploadFotoInterceptor)
  substituirFoto(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('produtoId', ParseUuidOu404Pipe) produtoId: string,
    @UploadedFile() foto: Express.Multer.File,
  ): Promise<ProdutoView> {
    return this.fotos.substituir(tenantId, filialId, produtoId, foto.buffer);
  }

  @Delete(':produtoId/foto')
  removerFoto(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('produtoId', ParseUuidOu404Pipe) produtoId: string,
  ): Promise<ProdutoView> {
    return this.fotos.remover(tenantId, filialId, produtoId);
  }
}
