import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { LimitarRequisicoes } from '../../../common/throttle/limites-de-requisicao';
import { CadastrarLojistaDto } from '../../lojistas/dtos/cadastrar-lojista.dto';
import { LoginDto } from '../dtos/login.dto';
import { AuthService } from '../services/auth.service';
import type { SessaoView } from '../views/sessao.view';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('cadastro')
  @LimitarRequisicoes('cadastro')
  cadastrar(@Body() dto: CadastrarLojistaDto): Promise<SessaoView> {
    return this.auth.cadastrar(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @LimitarRequisicoes('login')
  login(@Body() dto: LoginDto): Promise<SessaoView> {
    return this.auth.login(dto);
  }
}
