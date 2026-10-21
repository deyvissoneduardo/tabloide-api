import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { ApiRespostasDeErro } from '../../../common/swagger/respostas.decorator';
import { LimitarRequisicoes } from '../../../common/throttle/limites-de-requisicao';
import { CadastrarLojistaDto } from '../../lojistas/dtos/cadastrar-lojista.dto';
import { LoginDto } from '../dtos/login.dto';
import { AuthService } from '../services/auth.service';
import type { SessaoView } from '../views/sessao.view';

@ApiTags('Autenticação')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('cadastro')
  @ApiOperation({ summary: 'Cadastra o lojista e já devolve a sessão' })
  @ApiRespostasDeErro(
    CodigoErro.VALIDACAO_INVALIDA,
    CodigoErro.EMAIL_JA_CADASTRADO,
    CodigoErro.MUITAS_TENTATIVAS,
  )
  @LimitarRequisicoes('cadastro')
  cadastrar(@Body() dto: CadastrarLojistaDto): Promise<SessaoView> {
    return this.auth.cadastrar(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login do lojista (JWT de 8 h, sem refresh)' })
  @ApiRespostasDeErro(
    CodigoErro.VALIDACAO_INVALIDA,
    CodigoErro.CREDENCIAIS_INVALIDAS,
    CodigoErro.MUITAS_TENTATIVAS,
  )
  @HttpCode(HttpStatus.OK)
  @LimitarRequisicoes('login')
  login(@Body() dto: LoginDto): Promise<SessaoView> {
    return this.auth.login(dto);
  }
}
