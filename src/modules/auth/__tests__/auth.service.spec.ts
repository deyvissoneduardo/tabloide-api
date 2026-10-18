import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ClockService } from '../../../common/clock/clock.service';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { StatusLojista } from '../../lojistas/models/status-lojista';
import type { LojistasService } from '../../lojistas/services/lojistas.service';
import type { SenhaService } from '../../lojistas/services/senha.service';
import { AuthService } from '../services/auth.service';
import { umCadastroDeLojista } from '../../../../test/factories/lojista.factory';

const AGORA = new Date('2026-10-18T12:00:00Z');
const SEGREDO = 's'.repeat(32);

const umLojista = (status: StatusLojista) => ({
  lojista: {
    id: '0192f7a0-7c1e-7b3a-9d2f-1a2b3c4d5e6f',
    nomeFantasia: 'Mercado',
    nomeResponsavel: 'Ana',
    email: 'ana@x.com',
    whatsapp: '+5511987654321',
    cnpj: null,
    senhaHash: '$argon2id$real',
    createdAt: AGORA,
  },
  status,
});

describe('Funcionalidade: AuthService', () => {
  let service: AuthService;
  let expiracao: string;
  const jwt = new JwtService({ secret: SEGREDO, signOptions: { algorithm: 'HS256' } });
  const lojistas = { buscarParaLogin: jest.fn(), cadastrar: jest.fn() };
  const senhaService = { gerarHash: jest.fn().mockResolvedValue('$argon2id$ficticio'), verificar: jest.fn() };
  const clock = { agora: () => AGORA } as ClockService;
  const config = { get: jest.fn(() => expiracao) } as unknown as ConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();
    expiracao = '8h';
    service = new AuthService(
      lojistas as unknown as LojistasService,
      senhaService as unknown as SenhaService,
      jwt,
      clock,
      config as never,
    );
    await service.onModuleInit();
  });

  describe('Funcionalidade: Login do lojista (RN05, RNF05)', () => {
    describe('Cenário: login com sucesso', () => {
      it('Então devolve token, expiraEm e lojistaView sem senhaHash', async () => {
        lojistas.buscarParaLogin.mockResolvedValue(umLojista(StatusLojista.ATIVO));
        senhaService.verificar.mockResolvedValue(true);
        const sessao = await service.login({ email: 'ana@x.com', senha: 'senhaForte1' });

        const payload = jwt.decode(sessao.token) as Record<string, unknown>;
        expect(payload).toMatchObject({ sub: '0192f7a0-7c1e-7b3a-9d2f-1a2b3c4d5e6f', typ: 'lojista' });
        expect(payload.exp).toBe(AGORA.getTime() / 1000 + 8 * 3600);
        expect(sessao.expiraEm).toBe('2026-10-18T20:00:00.000Z');
        expect(sessao.lojista.status).toBe(StatusLojista.ATIVO);
        expect(JSON.stringify(sessao)).not.toContain('senhaHash');
        expect(senhaService.verificar).toHaveBeenCalledWith('$argon2id$real', 'senhaForte1');
      });
    });

    describe.each([StatusLojista.AGUARDANDO_ATIVACAO, StatusLojista.DESATIVADO])(
      'Cenário: login de lojista %s',
      (status) => {
        it('Então devolve token (o status não bloqueia o login)', async () => {
          lojistas.buscarParaLogin.mockResolvedValue(umLojista(status));
          senhaService.verificar.mockResolvedValue(true);
          await expect(service.login({ email: 'ana@x.com', senha: 'x' })).resolves.toHaveProperty('token');
        });
      },
    );

    describe('Cenário: senha errada', () => {
      it('Então lança CREDENCIAIS_INVALIDAS', () => {
        lojistas.buscarParaLogin.mockResolvedValue(umLojista(StatusLojista.ATIVO));
        senhaService.verificar.mockResolvedValue(false);
        return expect(service.login({ email: 'ana@x.com', senha: 'errada1' })).rejects.toMatchObject({
          codigo: CodigoErro.CREDENCIAIS_INVALIDAS,
        });
      });
    });

    describe('Cenário: e-mail inexistente com tempo igualado', () => {
      it('Então verifica a senha contra o hash fictício e lança CREDENCIAIS_INVALIDAS', async () => {
        lojistas.buscarParaLogin.mockResolvedValue(null);
        senhaService.verificar.mockResolvedValue(false);
        await expect(service.login({ email: 'nao@x.com', senha: 'senha1' })).rejects.toMatchObject({
          codigo: CodigoErro.CREDENCIAIS_INVALIDAS,
        });
        expect(senhaService.verificar).toHaveBeenCalledWith('$argon2id$ficticio', 'senha1');
      });
    });

    describe('Cenário: mesma mensagem para e-mail e senha', () => {
      it('Então as duas falhas têm a mesma mensagem', async () => {
        senhaService.verificar.mockResolvedValue(false);
        lojistas.buscarParaLogin.mockResolvedValue(null);
        const semEmail = await service.login({ email: 'a@x.com', senha: 'x' }).catch((e: Error) => e.message);
        lojistas.buscarParaLogin.mockResolvedValue(umLojista(StatusLojista.ATIVO));
        const senhaErrada = await service
          .login({ email: 'a@x.com', senha: 'x' })
          .catch((e: Error) => e.message);
        expect(semEmail).toBe(senhaErrada);
      });
    });

    describe('Cenário: expiração configurável', () => {
      it('Então JWT_EXPIRES_IN 1h gera expiraEm = agora + 1h', () => {
        expiracao = '1h';
        expect(service.emitirToken('t1').expiraEm).toBe('2026-10-18T13:00:00.000Z');
      });
    });
  });

  describe('Funcionalidade: Cadastro com sessão', () => {
    describe('Cenário: cadastrar já devolve sessão', () => {
      it('Então devolve lojistaView AGUARDANDO_ATIVACAO, token e expiraEm', async () => {
        lojistas.cadastrar.mockResolvedValue(umLojista(StatusLojista.AGUARDANDO_ATIVACAO));
        const sessao = await service.cadastrar(umCadastroDeLojista().build());
        expect(sessao.lojista.status).toBe(StatusLojista.AGUARDANDO_ATIVACAO);
        expect(sessao.token).toEqual(expect.any(String));
        expect(sessao.expiraEm).toBe('2026-10-18T20:00:00.000Z');
      });
    });
  });
});
