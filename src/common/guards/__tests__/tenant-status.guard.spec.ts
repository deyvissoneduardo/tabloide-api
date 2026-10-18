import { contextoFalso } from '../../../../test/helpers/contexto-falso';
import { StatusLojista } from '../../../modules/lojistas/models/status-lojista';
import { StatusLojistaCache } from '../../../modules/lojistas/services/status-lojista.cache';
import { IS_PUBLIC } from '../../decorators/public.decorator';
import { SOMENTE_LEITURA_PERMITIDA } from '../../decorators/somente-leitura-permitida.decorator';
import { CodigoErro } from '../../errors/codigos-erro';
import { TenantStatusGuard } from '../tenant-status.guard';

describe('Funcionalidade: Permissões por status do lojista (RN08, tabela de status)', () => {
  const executar = (
    status: StatusLojista | null,
    metodo: string,
    metadata: Record<string, unknown> = {},
    cache: Pick<StatusLojistaCache, 'obter'> = { obter: jest.fn().mockResolvedValue(status) },
  ) => {
    const req: Record<string, unknown> = { method: metodo, user: { tenantId: 't1' } };
    const { ctx, reflector } = contextoFalso(req, metadata);
    const guard = new TenantStatusGuard(reflector, cache as StatusLojistaCache);
    return { req, cache, promessa: guard.canActivate(ctx) };
  };

  describe('Esquema do Cenário: status x método', () => {
    it.each([
      [StatusLojista.AGUARDANDO_ATIVACAO, 'GET'],
      [StatusLojista.AGUARDANDO_ATIVACAO, 'POST'],
      [StatusLojista.AGUARDANDO_ATIVACAO, 'PATCH'],
      [StatusLojista.AGUARDANDO_ATIVACAO, 'DELETE'],
      [StatusLojista.ATIVO, 'GET'],
      [StatusLojista.ATIVO, 'POST'],
      [StatusLojista.ATIVO, 'PUT'],
      [StatusLojista.ATIVO, 'DELETE'],
      [StatusLojista.DESATIVADO, 'GET'],
      [StatusLojista.DESATIVADO, 'HEAD'],
      [StatusLojista.DESATIVADO, 'OPTIONS'],
    ])('Dado %s, quando chega %s, então libera', (status, metodo) =>
      expect(executar(status, metodo).promessa).resolves.toBe(true),
    );

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
      'Dado DESATIVADO, quando chega %s, então 403 LOJISTA_DESATIVADO',
      (metodo) =>
        expect(executar(StatusLojista.DESATIVADO, metodo).promessa).rejects.toMatchObject({
          codigo: CodigoErro.LOJISTA_DESATIVADO,
          status: 403,
        }),
    );
  });

  describe('Cenário: rota pública ignora status', () => {
    it('Então libera sem consultar o cache', async () => {
      const { cache, promessa } = executar(StatusLojista.DESATIVADO, 'POST', { [IS_PUBLIC]: true });
      await expect(promessa).resolves.toBe(true);
      expect(cache.obter).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: requisição sem usuário autenticado', () => {
    it('Então lança NAO_AUTENTICADO', () => {
      const { ctx, reflector } = contextoFalso({ method: 'GET' });
      const guard = new TenantStatusGuard(reflector, { obter: jest.fn() } as unknown as StatusLojistaCache);
      return expect(guard.canActivate(ctx)).rejects.toMatchObject({ codigo: CodigoErro.NAO_AUTENTICADO });
    });
  });

  describe('Cenário: lojista inexistente', () => {
    it('Então lança NAO_AUTENTICADO', () =>
      expect(executar(null, 'GET').promessa).rejects.toMatchObject({ codigo: CodigoErro.NAO_AUTENTICADO }));
  });

  describe('Cenário: escrita permitida por decorator', () => {
    it('Então libera POST de lojista desativado com @SomenteLeituraPermitida()', () =>
      expect(
        executar(StatusLojista.DESATIVADO, 'POST', { [SOMENTE_LEITURA_PERMITIDA]: true }).promessa,
      ).resolves.toBe(true));
  });

  describe('Cenário: status disponível para o controller', () => {
    it('Então req.statusLojista = ATIVO', async () => {
      const { req, promessa } = executar(StatusLojista.ATIVO, 'GET');
      await promessa;
      expect(req.statusLojista).toBe(StatusLojista.ATIVO);
    });
  });

  describe('Cenário: reativação reflete após o TTL (RN08)', () => {
    it('Então um PATCH passa a ser liberado', async () => {
      let agora = 1_000; // o lru-cache trata início 0 como "sem TTL"
      let statusNoBanco = StatusLojista.DESATIVADO;
      const cache = new StatusLojistaCache(30_000, async () => statusNoBanco, { now: () => agora });

      await expect(executar(null, 'PATCH', {}, cache).promessa).rejects.toMatchObject({
        codigo: CodigoErro.LOJISTA_DESATIVADO,
      });
      statusNoBanco = StatusLojista.ATIVO;
      await expect(executar(null, 'PATCH', {}, cache).promessa).rejects.toMatchObject({
        codigo: CodigoErro.LOJISTA_DESATIVADO,
      });
      agora += 30_001;
      await expect(executar(null, 'PATCH', {}, cache).promessa).resolves.toBe(true);
    });
  });
});
