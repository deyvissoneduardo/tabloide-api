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
import { CAMPO_IMAGEM, UploadImagemInterceptor } from '../../midia/interceptors/upload-imagem.interceptor';
import { CriarPanfletoDto } from '../dtos/criar-panfleto.dto';
import { EditarDatasPanfletoDto } from '../dtos/editar-datas-panfleto.dto';
import { ListarPanfletosQueryDto } from '../dtos/listar-panfletos-query.dto';
import { PanfletosService } from '../services/panfletos.service';
import { PanfletoView } from '../views/panfleto.view';

@ApiPainel('Panfletos')
@ApiParamUuid('filialId')
@Controller('painel/filiais/:filialId/panfletos')
export class PanfletosController {
  constructor(private readonly panfletos: PanfletosService) {}

  @Post()
  @UseInterceptors(UploadImagemInterceptor)
  @ApiOperation({ summary: 'Cria panfleto com imagem, sem sobrepor períodos (RN13–RN17)' })
  @ApiUpload({ campo: CAMPO_IMAGEM, obrigatorio: true, dto: CriarPanfletoDto })
  @ApiRespostasDeErro(
    CodigoErro.VALIDACAO_INVALIDA,
    CodigoErro.RECURSO_NAO_ENCONTRADO,
    CodigoErro.DATA_INICIO_INVALIDA,
    CodigoErro.DATA_LIMITE_INVALIDA,
    CodigoErro.PANFLETO_PERIODO_SOBREPOSTO,
    CodigoErro.PANFLETO_ATUAL_SEM_DATA_LIMITE,
    CodigoErro.LOJISTA_DESATIVADO,
    CodigoErro.IMAGEM_INVALIDA,
    CodigoErro.IMAGEM_MUITO_GRANDE,
    CodigoErro.ARMAZENAMENTO_INDISPONIVEL,
  )
  criar(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Body() dto: CriarPanfletoDto,
    @UploadedFile() arquivo: Express.Multer.File,
  ): Promise<PanfletoView> {
    return this.panfletos.criar(tenantId, filialId, dto, arquivo.buffer);
  }

  @Get()
  @ApiOperation({ summary: 'Lista panfletos da filial, com filtro por situação' })
  @ApiRespostaPaginada(PanfletoView)
  @ApiRespostasDeErro(CodigoErro.VALIDACAO_INVALIDA, CodigoErro.RECURSO_NAO_ENCONTRADO)
  listar(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Query() query: ListarPanfletosQueryDto,
  ): Promise<Pagina<PanfletoView>> {
    return this.panfletos.listar(tenantId, filialId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um panfleto' })
  @ApiParamUuid('id')
  @ApiRespostasDeErro(CodigoErro.RECURSO_NAO_ENCONTRADO)
  detalhar(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('id', ParseUuidOu404Pipe) id: string,
  ): Promise<PanfletoView> {
    return this.panfletos.detalhar(tenantId, filialId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita as datas do panfleto (RN26, RNF07)' })
  @ApiParamUuid('id')
  @ApiRespostasDeErro(
    CodigoErro.VALIDACAO_INVALIDA,
    CodigoErro.RECURSO_NAO_ENCONTRADO,
    CodigoErro.ITEM_NAO_EDITAVEL,
    CodigoErro.DATA_INICIO_IMUTAVEL,
    CodigoErro.DATA_INICIO_INVALIDA,
    CodigoErro.DATA_LIMITE_INVALIDA,
    CodigoErro.PANFLETO_PERIODO_SOBREPOSTO,
    CodigoErro.PANFLETO_ATUAL_SEM_DATA_LIMITE,
    CodigoErro.LOJISTA_DESATIVADO,
  )
  editarDatas(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('id', ParseUuidOu404Pipe) id: string,
    @Body() dto: EditarDatasPanfletoDto,
  ): Promise<PanfletoView> {
    return this.panfletos.editarDatas(tenantId, filialId, id, dto);
  }

  @Put(':id/imagem')
  @UseInterceptors(UploadImagemInterceptor)
  @ApiOperation({ summary: 'Troca a imagem do panfleto' })
  @ApiParamUuid('id')
  @ApiUpload({ campo: CAMPO_IMAGEM, obrigatorio: true })
  @ApiRespostasDeErro(
    CodigoErro.VALIDACAO_INVALIDA,
    CodigoErro.RECURSO_NAO_ENCONTRADO,
    CodigoErro.ITEM_NAO_EDITAVEL,
    CodigoErro.LOJISTA_DESATIVADO,
    CodigoErro.IMAGEM_INVALIDA,
    CodigoErro.IMAGEM_MUITO_GRANDE,
    CodigoErro.ARMAZENAMENTO_INDISPONIVEL,
  )
  trocarImagem(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('id', ParseUuidOu404Pipe) id: string,
    @UploadedFile() arquivo: Express.Multer.File,
  ): Promise<PanfletoView> {
    return this.panfletos.trocarImagem(tenantId, filialId, id, arquivo.buffer);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui o panfleto (exclusão lógica)' })
  @ApiParamUuid('id')
  @ApiRespostasDeErro(CodigoErro.RECURSO_NAO_ENCONTRADO, CodigoErro.LOJISTA_DESATIVADO)
  async excluir(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('id', ParseUuidOu404Pipe) id: string,
  ): Promise<void> {
    await this.panfletos.excluir(tenantId, filialId, id);
  }
}
