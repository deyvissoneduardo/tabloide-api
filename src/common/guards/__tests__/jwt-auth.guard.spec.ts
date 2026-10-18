import { JwtService } from '@nestjs/jwt';
import { ClsServiceManager } from 'nestjs-cls';
import { contextoFalso } from '../../../../test/helpers/contexto-falso';
import type { ClockService } from '../../clock/clock.service';
import { IS_PUBLIC } from '../../decorators/public.decorator';
import { CodigoErro } from '../../errors/codigos-erro';
import { TenantContext } from '../../tenant/tenant-context';
import { JwtAuthGuard } from '../jwt-auth.guard';

const SEGREDO = 's'.repeat(32);
const AGORA = new Date('2026-10-18T12:00:00Z');
const iat = AGORA.getTime() / 1000;

describe('Funcionalidade: Autenticação do painel', () => {
  const jwt = new JwtService({ secret: SEGREDO, signOptions: { algorithm: 'HS256' } });
  const clock = { agora: () => AGORA } as ClockService;
  const cls = ClsServiceManager.getClsService();
  const tenantContext = new TenantContext(cls);
  const token = (payload: object, opcoes: object = {}) =>
    jwt.sign(payload, { expiresIn: 8 * 3600, ...opcoes });

  const executar = (headers: Record<string, string>, metadata: Record<string, unknown> = {}) => {
    const req: Record<string, unknown> = { headers };
    const { ctx, reflector } = contextoFalso(req, metadata);
    const guard = new JwtAuthGuard(reflector, jwt, clock, tenantContext);
    return {
      req,
      resultado: () => cls.run(() => ({ ok: guard.canActivate(ctx), tenant: tenantContext.obter() })),
    };
  };

  const esperaNaoAutenticado = (headers: Record<string, string>) =>
    expect(() => executar(headers).resultado()).toThrow(
      expect.objectContaining({ codigo: CodigoErro.NAO_AUTENTICADO }),
    );

  describe('Cenário: rota pública', () => {
    it('Então libera sem Authorization', () =>
      expect(executar({}, { [IS_PUBLIC]: true }).resultado().ok).toBe(true));
  });

  describe('Cenário: token válido', () => {
    it('Então libera, preenche req.user e o TenantContext', () => {
      const { req, resultado } = executar({
        authorization: `Bearer ${token({ sub: 't1', typ: 'lojista', iat })}`,
      });
      expect(resultado()).toEqual({ ok: true, tenant: 't1' });
      expect(req.user).toEqual({ tenantId: 't1' });
    });
  });

  describe('Cenário: sem header', () => {
    it('Então lança NAO_AUTENTICADO', () => esperaNaoAutenticado({}));
  });

  describe('Cenário: esquema diferente de Bearer', () => {
    it('Então lança NAO_AUTENTICADO', () => esperaNaoAutenticado({ authorization: 'Basic abc' }));
  });

  describe('Cenário: Bearer sem token', () => {
    it('Então lança NAO_AUTENTICADO', () => esperaNaoAutenticado({ authorization: 'Bearer' }));
  });

  describe('Cenário: token expirado', () => {
    it('Então lança NAO_AUTENTICADO', () =>
      esperaNaoAutenticado({
        authorization: `Bearer ${token({ sub: 't1', typ: 'lojista', iat: iat - 9 * 3600 })}`,
      }));
  });

  describe('Cenário: assinatura inválida', () => {
    it('Então lança NAO_AUTENTICADO', () => {
      const outro = new JwtService({ secret: 'o'.repeat(32) });
      esperaNaoAutenticado({ authorization: `Bearer ${outro.sign({ sub: 't1', typ: 'lojista', iat })}` });
    });
  });

  describe('Cenário: typ diferente de lojista', () => {
    it('Então lança NAO_AUTENTICADO', () =>
      esperaNaoAutenticado({ authorization: `Bearer ${token({ sub: 't1', typ: 'admin', iat })}` }));
  });

  describe('Cenário: token sem sub', () => {
    it('Então lança NAO_AUTENTICADO', () =>
      esperaNaoAutenticado({ authorization: `Bearer ${token({ typ: 'lojista', iat })}` }));
  });

  describe('Cenário: token com alg none', () => {
    it('Então lança NAO_AUTENTICADO', () => {
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const semAssinatura = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 't1', typ: 'lojista', iat })}.`;
      esperaNaoAutenticado({ authorization: `Bearer ${semAssinatura}` });
    });
  });
});
