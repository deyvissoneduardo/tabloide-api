import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import type { Pagina } from '../../../common/dtos/paginacao-query.dto';
import { TenantId } from '../../../common/decorators/tenant-id.decorator';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import {
  ApiPainel,
  ApiRespostaPaginada,
  ApiRespostasDeErro,
} from '../../../common/swagger/respostas.decorator';
import { ListarAuditoriaQueryDto } from '../dtos/listar-auditoria-query.dto';
import { AuditoriaService } from '../services/auditoria.service';
import { AuditoriaAlteracaoView, auditoriaAlteracaoView } from '../views/auditoria-alteracao.view';

@ApiPainel('Auditoria')
@Controller('painel/auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  @ApiOperation({ summary: 'Histórico de alterações de datas e preços (RNF07)' })
  @ApiRespostaPaginada(AuditoriaAlteracaoView)
  @ApiRespostasDeErro(CodigoErro.VALIDACAO_INVALIDA)
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
