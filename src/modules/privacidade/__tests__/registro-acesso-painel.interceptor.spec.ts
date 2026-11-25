import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { RegistroAcessoPainelInterceptor } from '../interceptors/registro-acesso-painel.interceptor';
import type { RegistroAcessoPainelService } from '../services/registro-acesso-painel.service';

function contexto(req: object, tipo = 'http'): ExecutionContext {
  return {
    getType: () => tipo,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('Funcionalidade: Interceptor de registro de acesso ao painel', () => {
  const registro = { registrar: jest.fn().mockResolvedValue(undefined) };
  const interceptor = new RegistroAcessoPainelInterceptor(registro as unknown as RegistroAcessoPainelService);
  const proximo: CallHandler = { handle: () => of('resposta') };

  beforeEach(() => registro.registrar.mockClear());

  it('Cenário: Dado lojista autenticado, então registra antes do handler com o tenant do JWT', async () => {
    const req = {
      user: { tenantId: 't1' },
      ip: '203.0.113.7',
      method: 'PATCH',
      originalUrl: '/v1/filiais/1',
    };
    await expect(lastValueFrom(interceptor.intercept(contexto(req), proximo))).resolves.toBe('resposta');
    expect(registro.registrar).toHaveBeenCalledWith({
      tenantId: 't1',
      ip: '203.0.113.7',
      metodo: 'PATCH',
      url: '/v1/filiais/1',
    });
  });

  it('Cenário: Dado sem originalUrl, então usa url', async () => {
    const req = { user: { tenantId: 't1' }, ip: '::1', method: 'GET', url: '/v1/x' };
    await lastValueFrom(interceptor.intercept(contexto(req), proximo));
    expect(registro.registrar).toHaveBeenCalledWith(expect.objectContaining({ url: '/v1/x' }));
  });

  it.each([
    ['rota pública ou admin (sem req.user)', contexto({ ip: '::1', method: 'GET', url: '/v1/publico/x' })],
    ['contexto que não é HTTP', contexto({ user: { tenantId: 't1' } }, 'rpc')],
  ])('Cenário: Dado %s, então não registra', async (_nome, ctx) => {
    await expect(lastValueFrom(interceptor.intercept(ctx, proximo))).resolves.toBe('resposta');
    expect(registro.registrar).not.toHaveBeenCalled();
  });
});
