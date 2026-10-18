import { Body, Controller, Get, Patch } from '@nestjs/common';
import { TenantId } from '../../../common/decorators/tenant-id.decorator';
import { EditarLojistaDto } from '../dtos/editar-lojista.dto';
import { LojistasService } from '../services/lojistas.service';
import { lojistaView, type LojistaView } from '../views/lojista.view';

@Controller('painel/lojista')
export class PainelLojistaController {
  constructor(private readonly lojistas: LojistasService) {}

  @Get()
  async obter(@TenantId() tenantId: string): Promise<LojistaView> {
    const { lojista, status } = await this.lojistas.obterPorTenant(tenantId);
    return lojistaView(lojista, status);
  }

  @Patch()
  async editar(@TenantId() tenantId: string, @Body() dto: EditarLojistaDto): Promise<LojistaView> {
    const { lojista, status } = await this.lojistas.editar(tenantId, dto);
    return lojistaView(lojista, status);
  }
}
