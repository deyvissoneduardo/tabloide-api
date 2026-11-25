import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminKeyGuard } from '../../../common/guards/admin-key.guard';
import { ParseUuidOu404Pipe } from '../../../common/pipes/parse-uuid-ou-404.pipe';
import { LimitarRequisicoes } from '../../../common/throttle/limites-de-requisicao';
import { LojistasService } from '../../lojistas/services/lojistas.service';
import { StatusLojistaCache } from '../../lojistas/services/status-lojista.cache';
import { ExportacaoDadosService } from '../../privacidade/services/exportacao-dados.service';
import { RedefinirSenhaDto } from '../dtos/redefinir-senha.dto';

// fora da spec: sem a chave a rota responde 404, como se não existisse
@ApiExcludeController()
@Public()
@UseGuards(AdminKeyGuard)
@LimitarRequisicoes('admin')
@Controller('admin/lojistas')
export class AdminLojistasController {
  constructor(
    private readonly lojistas: LojistasService,
    private readonly statusCache: StatusLojistaCache,
    private readonly exportacao: ExportacaoDadosService,
  ) {}

  @Patch(':id/senha')
  @HttpCode(HttpStatus.NO_CONTENT)
  async redefinirSenha(
    @Param('id', ParseUuidOu404Pipe) id: string,
    @Body() dto: RedefinirSenhaDto,
  ): Promise<void> {
    await this.lojistas.redefinirSenha(id, dto.novaSenha);
  }

  /** LGPD: encerra a conta a pedido do lojista; a página sai do ar já, sem esperar o cache de status. */
  @Patch(':id/encerramento')
  @HttpCode(HttpStatus.NO_CONTENT)
  async encerrar(@Param('id', ParseUuidOu404Pipe) id: string): Promise<void> {
    await this.lojistas.encerrar(id);
    this.statusCache.invalidar(id);
  }

  /** LGPD art. 18, II e V: dados do lojista em JSON, para atender acesso e portabilidade. */
  @Get(':id/dados')
  exportarDados(@Param('id', ParseUuidOu404Pipe) id: string): Promise<Record<string, unknown>> {
    return this.exportacao.exportar(id);
  }
}
