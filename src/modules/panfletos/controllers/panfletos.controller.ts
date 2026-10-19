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
import { UploadImagemInterceptor } from '../../midia/interceptors/upload-imagem.interceptor';
import { CriarPanfletoDto } from '../dtos/criar-panfleto.dto';
import { EditarDatasPanfletoDto } from '../dtos/editar-datas-panfleto.dto';
import { ListarPanfletosQueryDto } from '../dtos/listar-panfletos-query.dto';
import { PanfletosService } from '../services/panfletos.service';
import type { PanfletoView } from '../views/panfleto.view';

@Controller('painel/filiais/:filialId/panfletos')
export class PanfletosController {
  constructor(private readonly panfletos: PanfletosService) {}

  @Post()
  @UseInterceptors(UploadImagemInterceptor)
  criar(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Body() dto: CriarPanfletoDto,
    @UploadedFile() arquivo: Express.Multer.File,
  ): Promise<PanfletoView> {
    return this.panfletos.criar(tenantId, filialId, dto, arquivo.buffer);
  }

  @Get()
  listar(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Query() query: ListarPanfletosQueryDto,
  ): Promise<Pagina<PanfletoView>> {
    return this.panfletos.listar(tenantId, filialId, query);
  }

  @Get(':id')
  detalhar(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('id', ParseUuidOu404Pipe) id: string,
  ): Promise<PanfletoView> {
    return this.panfletos.detalhar(tenantId, filialId, id);
  }

  @Patch(':id')
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
  async excluir(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Param('id', ParseUuidOu404Pipe) id: string,
  ): Promise<void> {
    await this.panfletos.excluir(tenantId, filialId, id);
  }
}
