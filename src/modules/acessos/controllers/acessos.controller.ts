import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { TenantId } from '../../../common/decorators/tenant-id.decorator';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { ApiPainel, ApiRespostasDeErro } from '../../../common/swagger/respostas.decorator';
import { ResumoAcessosQueryDto } from '../dtos/resumo-acessos-query.dto';
import { ResumoAcessosService } from '../services/resumo-acessos.service';
import { resumoAcessosView, ResumoAcessosView } from '../views/resumo-acessos.view';

@ApiPainel('Acessos')
@Controller('painel/acessos')
export class AcessosController {
  constructor(private readonly resumos: ResumoAcessosService) {}

  @Get()
  @ApiOperation({
    summary:
      'Resumo de acessos do lojista: total, ranking de filiais, por dia e horário de pico (RN53, RN54, RN57)',
  })
  @ApiRespostasDeErro(
    CodigoErro.VALIDACAO_INVALIDA,
    CodigoErro.PERIODO_INVALIDO,
    CodigoErro.RECURSO_NAO_ENCONTRADO,
  )
  async resumo(
    @TenantId() tenantId: string,
    @Query() query: ResumoAcessosQueryDto,
  ): Promise<ResumoAcessosView> {
    return resumoAcessosView(await this.resumos.resumo(tenantId, query));
  }
}
