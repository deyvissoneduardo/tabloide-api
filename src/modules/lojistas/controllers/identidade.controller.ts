import { Body, Controller, Get, Patch, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { TenantId } from '../../../common/decorators/tenant-id.decorator';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { ApiPainel, ApiRespostasDeErro } from '../../../common/swagger/respostas.decorator';
import { ApiUpload } from '../../midia/interceptors/api-upload.decorator';
import { CAMPO_IMAGEM, UploadImagemInterceptor } from '../../midia/interceptors/upload-imagem.interceptor';
import { EditarIdentidadeDto } from '../dtos/editar-identidade.dto';
import { IdentidadeService } from '../services/identidade.service';
import type { IdentidadeView } from '../views/identidade.view';

@ApiPainel('Lojista')
@Controller('painel/lojista')
export class IdentidadeController {
  constructor(private readonly identidade: IdentidadeService) {}

  @Get('identidade')
  @ApiOperation({ summary: 'Identidade visual (nome, cores e logo)' })
  obter(@TenantId() tenantId: string): Promise<IdentidadeView> {
    return this.identidade.obter(tenantId);
  }

  @Patch('identidade')
  @ApiOperation({ summary: 'Edita nome fantasia e cores' })
  @ApiRespostasDeErro(CodigoErro.VALIDACAO_INVALIDA, CodigoErro.LOJISTA_DESATIVADO)
  editar(@TenantId() tenantId: string, @Body() dto: EditarIdentidadeDto): Promise<IdentidadeView> {
    return this.identidade.editar(tenantId, dto);
  }

  @Put('logo')
  @UseInterceptors(UploadImagemInterceptor)
  @ApiOperation({ summary: 'Troca o logo (até 512 px)' })
  @ApiUpload({ campo: CAMPO_IMAGEM, obrigatorio: true })
  @ApiRespostasDeErro(
    CodigoErro.VALIDACAO_INVALIDA,
    CodigoErro.LOJISTA_DESATIVADO,
    CodigoErro.IMAGEM_INVALIDA,
    CodigoErro.IMAGEM_MUITO_GRANDE,
    CodigoErro.ARMAZENAMENTO_INDISPONIVEL,
  )
  trocarLogo(
    @TenantId() tenantId: string,
    @UploadedFile() arquivo: Express.Multer.File,
  ): Promise<IdentidadeView> {
    return this.identidade.trocarLogo(tenantId, arquivo.buffer);
  }
}
