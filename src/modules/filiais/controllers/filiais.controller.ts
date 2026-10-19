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
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PaginacaoQueryDto, type Pagina } from '../../../common/dtos/paginacao-query.dto';
import { TenantId } from '../../../common/decorators/tenant-id.decorator';
import { ParseUuidOu404Pipe } from '../../../common/pipes/parse-uuid-ou-404.pipe';
import { AppConfig } from '../../../config/app.config';
import { CriarFilialDto } from '../dtos/criar-filial.dto';
import { EditarFilialDto } from '../dtos/editar-filial.dto';
import { QrCodeQueryDto } from '../dtos/qrcode-query.dto';
import { FiliaisService } from '../services/filiais.service';
import { QrCodeService } from '../services/qrcode.service';
import { filialView, listaDeFiliaisView, type FilialView } from '../views/filial.view';

const CACHE_QR_CODE = 'private, max-age=86400';

@Controller('painel/filiais')
export class FiliaisController {
  constructor(
    private readonly filiais: FiliaisService,
    private readonly qrCode: QrCodeService,
    private readonly config: AppConfig,
  ) {}

  @Get()
  async listar(@TenantId() tenantId: string, @Query() query: PaginacaoQueryDto): Promise<Pagina<FilialView>> {
    const resultado = await this.filiais.listar(tenantId, {
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return listaDeFiliaisView(resultado, query.pagina, query.porPagina, this.config.publicBaseUrl);
  }

  @Get(':id')
  async obter(
    @TenantId() tenantId: string,
    @Param('id', ParseUuidOu404Pipe) id: string,
  ): Promise<FilialView> {
    return filialView(await this.filiais.obter(tenantId, id), this.config.publicBaseUrl);
  }

  @Post()
  async criar(
    @TenantId() tenantId: string,
    @Body() dto: CriarFilialDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<FilialView> {
    const filial = await this.filiais.criar(tenantId, dto);
    res.setHeader('Location', `/v1/painel/filiais/${filial.id}`);
    return filialView(filial, this.config.publicBaseUrl);
  }

  @Patch(':id')
  async editar(
    @TenantId() tenantId: string,
    @Param('id', ParseUuidOu404Pipe) id: string,
    @Body() dto: EditarFilialDto,
  ): Promise<FilialView> {
    return filialView(await this.filiais.editar(tenantId, id, dto), this.config.publicBaseUrl);
  }

  /** O front pede confirmação antes (RN12). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async excluir(@TenantId() tenantId: string, @Param('id', ParseUuidOu404Pipe) id: string): Promise<void> {
    await this.filiais.excluir(tenantId, id);
  }

  /** Ordem: valida a filial do tenant, calcula o ETag e só gera a imagem se o cliente não a tiver. */
  @Get(':id/qrcode')
  async qrcode(
    @TenantId() tenantId: string,
    @Param('id', ParseUuidOu404Pipe) id: string,
    @Query() query: QrCodeQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { codigoPublico } = await this.filiais.obter(tenantId, id);
    const etag = this.qrCode.etag(codigoPublico, query.formato, query.tamanho);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', CACHE_QR_CODE);
    if (req.headers['if-none-match'] === etag) {
      res.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }

    const { conteudo, contentType } = await this.qrCode.gerar(codigoPublico, query.formato, query.tamanho);
    const disposicao =
      query.download === '1' ? `attachment; filename="qrcode-${codigoPublico}.${query.formato}"` : 'inline';
    res
      .status(HttpStatus.OK)
      .setHeader('Content-Type', contentType)
      .setHeader('Content-Disposition', disposicao);
    res.send(conteudo);
  }
}
