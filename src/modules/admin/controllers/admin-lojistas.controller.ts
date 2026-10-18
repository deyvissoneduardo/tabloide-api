import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { naoEncontrado } from '../../../common/errors/errors';
import { AdminKeyGuard } from '../../../common/guards/admin-key.guard';
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
    @Param('id', new ParseUUIDPipe({ version: '7', exceptionFactory: () => naoEncontrado() })) id: string,
    @Body() dto: RedefinirSenhaDto,
  ): Promise<void> {
    await this.lojistas.redefinirSenha(id, dto.novaSenha);
  }
}
