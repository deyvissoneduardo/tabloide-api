import { randomBytes } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TIPO_TOKEN_LOJISTA, type PayloadToken } from '../../../common/auth/payload-token';
import { ClockService } from '../../../common/clock/clock.service';
import { credenciaisInvalidas } from '../../../common/errors/errors';
import { duracaoParaMs, type Env } from '../../../config/env.schema';
import { CadastrarLojistaDto } from '../../lojistas/dtos/cadastrar-lojista.dto';
import { LojistasService } from '../../lojistas/services/lojistas.service';
import { SenhaService } from '../../lojistas/services/senha.service';
import { lojistaView } from '../../lojistas/views/lojista.view';
import { LoginDto } from '../dtos/login.dto';
import type { SessaoView } from '../views/sessao.view';

@Injectable()
export class AuthService implements OnModuleInit {
  private hashFicticio = '';

  constructor(
    private readonly lojistas: LojistasService,
    private readonly senhaService: SenhaService,
    private readonly jwt: JwtService,
    private readonly clock: ClockService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.hashFicticio = await this.senhaService.gerarHash(randomBytes(32).toString('hex'));
  }

  async cadastrar(dto: CadastrarLojistaDto): Promise<SessaoView> {
    const { lojista, status } = await this.lojistas.cadastrar(dto);
    return { lojista: lojistaView(lojista, status), ...this.emitirToken(lojista.id) };
  }

  async login(dto: LoginDto): Promise<SessaoView> {
    const encontrado = await this.lojistas.buscarParaLogin(dto.email);
    if (!encontrado) {
      await this.senhaService.verificar(this.hashFicticio, dto.senha);
      throw credenciaisInvalidas();
    }
    const confere = await this.senhaService.verificar(encontrado.lojista.senhaHash, dto.senha);
    if (!confere) throw credenciaisInvalidas();

    return {
      lojista: lojistaView(encontrado.lojista, encontrado.status),
      ...this.emitirToken(encontrado.lojista.id),
    };
  }

  emitirToken(tenantId: string): { token: string; expiraEm: string } {
    const agoraMs = this.clock.agora().getTime();
    const duracao = this.config.get('JWT_EXPIRES_IN', { infer: true });
    const payload: PayloadToken = { sub: tenantId, typ: TIPO_TOKEN_LOJISTA, iat: Math.floor(agoraMs / 1000) };
    const token = this.jwt.sign(payload, { expiresIn: Math.floor(duracaoParaMs(duracao) / 1000) });
    return { token, expiraEm: new Date(agoraMs + duracaoParaMs(duracao)).toISOString() };
  }
}
