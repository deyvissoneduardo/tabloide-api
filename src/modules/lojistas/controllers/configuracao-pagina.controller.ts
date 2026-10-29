import { Body, Controller, Delete, Get, Patch, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { TenantId } from '../../../common/decorators/tenant-id.decorator';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { ApiPainel, ApiRespostasDeErro } from '../../../common/swagger/respostas.decorator';
import { ApiUpload } from '../../midia/interceptors/api-upload.decorator';
import { CAMPO_IMAGEM, UploadImagemInterceptor } from '../../midia/interceptors/upload-imagem.interceptor';
import { EditarConfiguracaoPaginaDto } from '../dtos/editar-configuracao-pagina.dto';
import { ConfiguracaoPaginaService } from '../services/configuracao-pagina.service';
import type { ConfiguracaoPaginaView } from '../views/configuracao-pagina.view';

const ERROS_DE_IMAGEM = [
  CodigoErro.VALIDACAO_INVALIDA,
  CodigoErro.LOJISTA_DESATIVADO,
  CodigoErro.IMAGEM_INVALIDA,
  CodigoErro.IMAGEM_MUITO_GRANDE,
  CodigoErro.ARMAZENAMENTO_INDISPONIVEL,
];

/** Aparência da página pública do lojista (RN46–RN48): vale para todas as filiais. */
@ApiPainel('Página')
@Controller('painel/lojista/pagina')
export class ConfiguracaoPaginaController {
  constructor(private readonly configuracao: ConfiguracaoPaginaService) {}

  @Get()
  @ApiOperation({ summary: 'Aparência da página: banner, nome da categoria e cores (null = padrão)' })
  obter(@TenantId() tenantId: string): Promise<ConfiguracaoPaginaView> {
    return this.configuracao.obter(tenantId);
  }

  @Patch()
  @ApiOperation({ summary: 'Edita a aparência da página (campos ausentes ficam como estão)' })
  @ApiRespostasDeErro(CodigoErro.VALIDACAO_INVALIDA, CodigoErro.LOJISTA_DESATIVADO)
  editar(
    @TenantId() tenantId: string,
    @Body() dto: EditarConfiguracaoPaginaDto,
  ): Promise<ConfiguracaoPaginaView> {
    return this.configuracao.editar(tenantId, dto);
  }

  @Put('banner/logo')
  @UseInterceptors(UploadImagemInterceptor)
  @ApiOperation({ summary: 'Troca o logo do banner (até 512 px)' })
  @ApiUpload({ campo: CAMPO_IMAGEM, obrigatorio: true })
  @ApiRespostasDeErro(...ERROS_DE_IMAGEM)
  trocarLogo(
    @TenantId() tenantId: string,
    @UploadedFile() arquivo: Express.Multer.File,
  ): Promise<ConfiguracaoPaginaView> {
    return this.configuracao.trocarLogoBanner(tenantId, arquivo.buffer);
  }

  @Delete('banner/logo')
  @ApiOperation({ summary: 'Remove o logo do banner (o arquivo fica no storage)' })
  @ApiRespostasDeErro(CodigoErro.LOJISTA_DESATIVADO)
  removerLogo(@TenantId() tenantId: string): Promise<ConfiguracaoPaginaView> {
    return this.configuracao.removerLogoBanner(tenantId);
  }

  @Put('banner/foto')
  @UseInterceptors(UploadImagemInterceptor)
  @ApiOperation({ summary: 'Troca a foto da campanha do banner (16:9, até 1600 px); substitui a descrição' })
  @ApiUpload({ campo: CAMPO_IMAGEM, obrigatorio: true })
  @ApiRespostasDeErro(...ERROS_DE_IMAGEM)
  trocarFoto(
    @TenantId() tenantId: string,
    @UploadedFile() arquivo: Express.Multer.File,
  ): Promise<ConfiguracaoPaginaView> {
    return this.configuracao.trocarFotoBanner(tenantId, arquivo.buffer);
  }

  @Delete('banner/foto')
  @ApiOperation({ summary: 'Remove a foto da campanha, se a campanha for foto' })
  @ApiRespostasDeErro(CodigoErro.LOJISTA_DESATIVADO)
  removerFoto(@TenantId() tenantId: string): Promise<ConfiguracaoPaginaView> {
    return this.configuracao.removerFotoBanner(tenantId);
  }
}
