import { Body, Controller, HttpCode, HttpStatus, Param, Patch, UseGuards } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminKeyGuard } from '../../../common/guards/admin-key.guard';
import { ParseUuidOu404Pipe } from '../../../common/pipes/parse-uuid-ou-404.pipe';
import { LimitarRequisicoes } from '../../../common/throttle/limites-de-requisicao';
import { LojistasService } from '../../lojistas/services/lojistas.service';
import { RedefinirSenhaDto } from '../dtos/redefinir-senha.dto';

@Public()
@UseGuards(AdminKeyGuard)
@LimitarRequisicoes('admin')
@Controller('admin/lojistas')
export class AdminLojistasController {
  constructor(private readonly lojistas: LojistasService) {}

  @Patch(':id/senha')
  @HttpCode(HttpStatus.NO_CONTENT)
  async redefinirSenha(
    @Param('id', ParseUuidOu404Pipe) id: string,
    @Body() dto: RedefinirSenhaDto,
  ): Promise<void> {
    await this.lojistas.redefinirSenha(id, dto.novaSenha);
  }
}
