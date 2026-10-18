import * as crypto from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { contextoFalso } from '../../../../test/helpers/contexto-falso';
import { CodigoErro } from '../../errors/codigos-erro';
import { AdminKeyGuard } from '../admin-key.guard';

jest.mock('node:crypto', () => {
  const real = jest.requireActual('node:crypto');
  return { ...real, timingSafeEqual: jest.fn(real.timingSafeEqual) };
});

const CHAVE = 'chave-admin-com-mais-de-32-caracteres-ok';

describe('Funcionalidade: Proteção do endpoint administrativo (RN36)', () => {
  const config = { get: () => CHAVE } as unknown as ConfigService;
  const guard = new AdminKeyGuard(config as never);
  let aviso: jest.SpyInstance;

  beforeEach(() => {
    aviso = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    (crypto.timingSafeEqual as jest.Mock).mockClear();
  });
  afterEach(() => aviso.mockRestore());

  const executar = (headers: Record<string, string>) =>
    guard.canActivate(contextoFalso({ headers, ip: '1.2.3.4' }).ctx);
  const esperaNaoEncontrado = (headers: Record<string, string>) =>
    expect(() => executar(headers)).toThrow(
      expect.objectContaining({ codigo: CodigoErro.RECURSO_NAO_ENCONTRADO }),
    );

  describe('Cenário: chave correta', () => {
    it('Então libera', () => expect(executar({ 'x-admin-key': CHAVE })).toBe(true));
  });

  describe('Cenário: sem header', () => {
    it('Então lança RECURSO_NAO_ENCONTRADO', () => esperaNaoEncontrado({}));
  });

  describe('Cenário: header vazio', () => {
    it('Então lança RECURSO_NAO_ENCONTRADO', () => esperaNaoEncontrado({ 'x-admin-key': '' }));
  });

  describe('Cenário: chave errada do mesmo tamanho', () => {
    it('Então lança RECURSO_NAO_ENCONTRADO', () =>
      esperaNaoEncontrado({ 'x-admin-key': `${CHAVE.slice(0, -1)}X` }));
  });

  describe('Cenário: chave errada de tamanho diferente', () => {
    it('Então lança RECURSO_NAO_ENCONTRADO sem erro de buffer', () =>
      esperaNaoEncontrado({ 'x-admin-key': 'x' }));
  });

  describe('Cenário: comparação em tempo constante', () => {
    it('Então timingSafeEqual recebe dois buffers de 32 bytes', () => {
      expect(() => executar({ 'x-admin-key': 'x' })).toThrow();
      const [a, b] = (crypto.timingSafeEqual as jest.Mock).mock.calls[0];
      expect([a.length, b.length]).toEqual([32, 32]);
    });
    it('E isso vale para qualquer chave', () => {
      try {
        executar({ 'x-admin-key': 'qualquer' });
      } catch {
        /* esperado */
      }
      const [a, b] = (crypto.timingSafeEqual as jest.Mock).mock.calls[0];
      expect([a.length, b.length]).toEqual([32, 32]);
    });
  });

  describe('Cenário: log sem a chave', () => {
    it('Então registra admin.chave_invalida com o ip e sem o valor recebido', () => {
      expect(() => executar({ 'x-admin-key': 'segredo-errado' })).toThrow();
      expect(aviso).toHaveBeenCalledWith({ evento: 'admin.chave_invalida', ip: '1.2.3.4' });
      expect(JSON.stringify(aviso.mock.calls)).not.toContain('segredo-errado');
    });
  });
});
