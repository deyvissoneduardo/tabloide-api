import { Writable } from 'node:stream';
import type { ConfigService } from '@nestjs/config';
import { CAMPOS_OMITIDOS_NO_LOG, destinoDeLogs, opcoesDoLogger } from '../logger.config';

type OpcoesPino = {
  level: string;
  transport?: unknown;
  redact: { paths: string[] };
  genReqId: (req: { headers: Record<string, unknown> }, res: { setHeader: jest.Mock }) => string;
};

const config = (env: Record<string, string>) =>
  ({ get: (chave: string) => env[chave] }) as unknown as ConfigService;

describe('Funcionalidade: Configuração do logger', () => {
  afterEach(() => {
    destinoDeLogs.stream = undefined;
  });

  const opcoes = (env: Record<string, string>) =>
    opcoesDoLogger(config(env) as never).pinoHttp as unknown as OpcoesPino;

  describe('Cenário: x-request-id recebido válido', () => {
    it('Então é reaproveitado e devolvido no header', () => {
      const res = { setHeader: jest.fn() };
      const id = opcoes({ LOG_LEVEL: 'info' }).genReqId({ headers: { 'x-request-id': 'abc-123' } }, res);
      expect(id).toBe('abc-123');
      expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'abc-123');
    });
  });

  describe('Cenário: x-request-id ausente ou inválido', () => {
    it.each([undefined, 'tem espaço', 'x'.repeat(65)])(
      'Então "%s" é trocado por um UUID novo',
      (recebido) => {
        const res = { setHeader: jest.fn() };
        const id = opcoes({}).genReqId({ headers: { 'x-request-id': recebido } }, res);
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
      },
    );
  });

  describe('Cenário: credenciais omitidas', () => {
    it('Então authorization, x-admin-key, senha e novaSenha são omitidos', () => {
      expect(opcoes({}).redact.paths).toEqual(CAMPOS_OMITIDOS_NO_LOG);
      expect(CAMPOS_OMITIDOS_NO_LOG).toEqual(
        expect.arrayContaining(['req.headers.authorization', 'req.headers["x-admin-key"]', 'req.body.senha']),
      );
    });
  });

  describe('Cenário: pino-pretty só em desenvolvimento', () => {
    it('Então desenvolvimento usa pino-pretty e produção não', () => {
      expect(opcoes({ NODE_ENV: 'development' }).transport).toEqual({ target: 'pino-pretty' });
      expect(opcoes({ NODE_ENV: 'production' }).transport).toBeUndefined();
    });
  });

  describe('Cenário: destino capturado pelos testes', () => {
    it('Então a saída vai para a stream informada, sem pino-pretty', () => {
      destinoDeLogs.stream = new Writable({ write: (_p, _e, feito) => feito() });
      const params = opcoesDoLogger(config({ NODE_ENV: 'development' }) as never).pinoHttp as [
        OpcoesPino,
        Writable,
      ];
      expect(params[1]).toBe(destinoDeLogs.stream);
      expect(params[0].transport).toBeUndefined();
    });
  });
});
