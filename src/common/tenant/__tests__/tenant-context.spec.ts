import { ClsService, ClsServiceManager } from 'nestjs-cls';
import { CodigoErro } from '../../errors/codigos-erro';
import { extrairTenantId } from '../../decorators/tenant-id.decorator';
import { TenantContext } from '../tenant-context';

describe('Funcionalidade: Contexto do tenant', () => {
  const cls: ClsService = ClsServiceManager.getClsService();
  const contexto = new TenantContext(cls);

  describe('Cenário: definir e obter', () => {
    it('Então devolve o tenant definido', () =>
      cls.run(() => {
        contexto.definir('t1');
        expect(contexto.obter()).toBe('t1');
        expect(contexto.obterObrigatorio()).toBe('t1');
      }));
  });

  describe('Cenário: obter sem definir', () => {
    it('Então devolve undefined', () => cls.run(() => expect(contexto.obter()).toBeUndefined()));
  });

  describe('Cenário: obrigatório sem tenant', () => {
    it('Então lança NAO_AUTENTICADO', () =>
      cls.run(() =>
        expect(() => contexto.obterObrigatorio()).toThrow(
          expect.objectContaining({ codigo: CodigoErro.NAO_AUTENTICADO }),
        ),
      ));
  });

  describe('Cenário: contextos isolados entre requisições concorrentes', () => {
    it('Então cada execução vê o próprio tenant após um await', async () => {
      const executar = (tenant: string, atraso: number) =>
        cls.run(async () => {
          contexto.definir(tenant);
          await new Promise((r) => setTimeout(r, atraso));
          return contexto.obter();
        });
      await expect(Promise.all([executar('t1', 10), executar('t2', 1)])).resolves.toEqual(['t1', 't2']);
    });
  });

  describe('Cenário: decorator @TenantId', () => {
    it('Então lê o tenant do usuário autenticado', () =>
      expect(extrairTenantId({ user: { tenantId: 't1' } })).toBe('t1'));
    it('Então lança NAO_AUTENTICADO sem usuário', () =>
      expect(() => extrairTenantId({})).toThrow(
        expect.objectContaining({ codigo: CodigoErro.NAO_AUTENTICADO }),
      ));
  });
});
