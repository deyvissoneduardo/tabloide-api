import { Body, Controller, Get, Patch, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { TenantId } from '../../../common/decorators/tenant-id.decorator';
import { UploadImagemInterceptor } from '../../midia/interceptors/upload-imagem.interceptor';
import { EditarIdentidadeDto } from '../dtos/editar-identidade.dto';
import { IdentidadeService } from '../services/identidade.service';
import type { IdentidadeView } from '../views/identidade.view';

@Controller('painel/lojista')
export class IdentidadeController {
  constructor(private readonly identidade: IdentidadeService) {}

  @Get('identidade')
  obter(@TenantId() tenantId: string): Promise<IdentidadeView> {
    return this.identidade.obter(tenantId);
  }

  @Patch('identidade')
  editar(@TenantId() tenantId: string, @Body() dto: EditarIdentidadeDto): Promise<IdentidadeView> {
    return this.identidade.editar(tenantId, dto);
  }

  @Put('logo')
  @UseInterceptors(UploadImagemInterceptor)
  trocarLogo(
    @TenantId() tenantId: string,
    @UploadedFile() arquivo: Express.Multer.File,
  ): Promise<IdentidadeView> {
    return this.identidade.trocarLogo(tenantId, arquivo.buffer);
  }
}
