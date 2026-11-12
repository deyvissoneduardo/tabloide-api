import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { TenantId } from '../../../common/decorators/tenant-id.decorator';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { ParseUuidOu404Pipe } from '../../../common/pipes/parse-uuid-ou-404.pipe';
import { ApiParamUuid } from '../../../common/swagger/parametros.decorator';
import { ApiPainel, ApiRespostasDeErro } from '../../../common/swagger/respostas.decorator';
import { PeriodoAcessosQueryDto } from '../dtos/periodo-acessos-query.dto';
import { AcessosPanfletosService } from '../services/acessos-panfletos.service';
import { acessosPanfletosView, AcessosPanfletosView } from '../views/acessos-panfletos.view';

@ApiPainel('Acessos')
@ApiParamUuid('filialId')
@Controller('painel/filiais/:filialId/acessos/panfletos')
export class AcessosPanfletosController {
  constructor(private readonly acessos: AcessosPanfletosService) {}

  @Get()
  @ApiOperation({
    summary: 'Acessos durante a vigência de cada panfleto da filial que cruza o período (RN55, RN56)',
  })
  @ApiRespostasDeErro(
    CodigoErro.VALIDACAO_INVALIDA,
    CodigoErro.PERIODO_INVALIDO,
    CodigoErro.RECURSO_NAO_ENCONTRADO,
  )
  async listar(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Query() query: PeriodoAcessosQueryDto,
  ): Promise<AcessosPanfletosView> {
    return acessosPanfletosView(await this.acessos.listar(tenantId, filialId, query));
  }
}
