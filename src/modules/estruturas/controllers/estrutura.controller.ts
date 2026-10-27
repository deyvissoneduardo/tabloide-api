import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { TenantId } from '../../../common/decorators/tenant-id.decorator';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { ParseUuidOu404Pipe } from '../../../common/pipes/parse-uuid-ou-404.pipe';
import { ApiParamUuid } from '../../../common/swagger/parametros.decorator';
import { ApiPainel, ApiRespostasDeErro } from '../../../common/swagger/respostas.decorator';
import { SalvarEstruturaDto } from '../dtos/salvar-estrutura.dto';
import { EstruturaService } from '../services/estrutura.service';
import { EstruturaView } from '../views/estrutura.view';

@ApiPainel('Página')
@ApiParamUuid('filialId')
@Controller('painel/filiais/:filialId/estrutura')
export class EstruturaController {
  constructor(private readonly estruturas: EstruturaService) {}

  @Get()
  @ApiOperation({
    summary: 'Ordem da página da filial: todas as categorias e os produtos vigentes e agendados (RN45)',
  })
  @ApiRespostasDeErro(CodigoErro.RECURSO_NAO_ENCONTRADO)
  obter(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
  ): Promise<EstruturaView> {
    return this.estruturas.obter(tenantId, filialId);
  }

  @Put()
  @ApiOperation({
    summary:
      'Substitui a ordem da página da filial; itens omitidos vão para o fim, em ordem alfabética (RN45)',
  })
  @ApiRespostasDeErro(
    CodigoErro.VALIDACAO_INVALIDA,
    CodigoErro.RECURSO_NAO_ENCONTRADO,
    CodigoErro.LOJISTA_DESATIVADO,
    CodigoErro.ESTRUTURA_INVALIDA,
  )
  salvar(
    @TenantId() tenantId: string,
    @Param('filialId', ParseUuidOu404Pipe) filialId: string,
    @Body() dto: SalvarEstruturaDto,
  ): Promise<EstruturaView> {
    return this.estruturas.salvar(tenantId, filialId, dto);
  }
}
