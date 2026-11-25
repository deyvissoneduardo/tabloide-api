import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { ApiRespostasDeErro } from '../../../common/swagger/respostas.decorator';
import { LimitarRequisicoes } from '../../../common/throttle/limites-de-requisicao';
import { CadastrarLojistaDto } from '../../lojistas/dtos/cadastrar-lojista.dto';
import { RegistroAcessoPainelService } from '../../privacidade/services/registro-acesso-painel.service';
import { LoginDto } from '../dtos/login.dto';
import { AuthService } from '../services/auth.service';
import type { SessaoView } from '../views/sessao.view';

@ApiTags('Autenticação')
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly registroAcesso: RegistroAcessoPainelService,
  ) {}

  @Post('cadastro')
  @ApiOperation({ summary: 'Cadastra o lojista e já devolve a sessão' })
  @ApiRespostasDeErro(
    CodigoErro.VALIDACAO_INVALIDA,
    CodigoErro.EMAIL_JA_CADASTRADO,
    CodigoErro.MUITAS_TENTATIVAS,
  )
  @LimitarRequisicoes('cadastro')
  async cadastrar(@Body() dto: CadastrarLojistaDto, @Req() req: Request): Promise<SessaoView> {
    return this.registrarAcesso(req, await this.auth.cadastrar(dto));
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
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<SessaoView> {
    return this.registrarAcesso(req, await this.auth.login(dto));
  }

  /** Marco Civil art. 15: login e cadastro bem-sucedidos também são acessos ao painel. */
  private async registrarAcesso(req: Request, sessao: SessaoView): Promise<SessaoView> {
    await this.registroAcesso.registrar({
      tenantId: sessao.lojista.id,
      ip: req.ip,
      metodo: req.method,
      url: req.originalUrl ?? req.url,
    });
    return sessao;
  }
}
