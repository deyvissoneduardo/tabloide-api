import { Controller, Get, Query } from '@nestjs/common';
import type { Pagina } from '../../../common/dtos/paginacao-query.dto';
import { TenantId } from '../../../common/decorators/tenant-id.decorator';
import { ListarAuditoriaQueryDto } from '../dtos/listar-auditoria-query.dto';
import { AuditoriaService } from '../services/auditoria.service';
import { auditoriaAlteracaoView, type AuditoriaAlteracaoView } from '../views/auditoria-alteracao.view';

@Controller('painel/auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  async listar(
    @TenantId() tenantId: string,
    @Query() query: ListarAuditoriaQueryDto,
  ): Promise<Pagina<AuditoriaAlteracaoView>> {
    const { itens, total } = await this.auditoria.listar(tenantId, query);
    return {
      itens: itens.map(auditoriaAlteracaoView),
      total,
      pagina: query.pagina,
      porPagina: query.porPagina,
    };
  }
}
