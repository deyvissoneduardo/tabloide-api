import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { TenantId } from '../../../common/decorators/tenant-id.decorator';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { ApiPainel, ApiRespostasDeErro } from '../../../common/swagger/respostas.decorator';
import { EditarLojistaDto } from '../dtos/editar-lojista.dto';
import { LojistasService } from '../services/lojistas.service';
import { lojistaView, type LojistaView } from '../views/lojista.view';

@ApiPainel('Lojista')
@Controller('painel/lojista')
export class PainelLojistaController {
  constructor(private readonly lojistas: LojistasService) {}

  @Get()
  @ApiOperation({ summary: 'Dados do lojista logado' })
  async obter(@TenantId() tenantId: string): Promise<LojistaView> {
    const { lojista, status } = await this.lojistas.obterPorTenant(tenantId);
    return lojistaView(lojista, status);
  }

  @Patch()
  @ApiOperation({ summary: 'Edita os dados do lojista' })
  @ApiRespostasDeErro(CodigoErro.VALIDACAO_INVALIDA, CodigoErro.LOJISTA_DESATIVADO)
  async editar(@TenantId() tenantId: string, @Body() dto: EditarLojistaDto): Promise<LojistaView> {
    const { lojista, status } = await this.lojistas.editar(tenantId, dto);
    return lojistaView(lojista, status);
  }
}
