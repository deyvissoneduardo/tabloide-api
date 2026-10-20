import type { Server } from 'node:http';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { configurarTimeouts, corsPorRota } from '../http.config';

const opcoesPara = (url: string) => {
  let opcoes: CorsOptions | undefined;
  corsPorRota(['https://painel.tabloide.app'])({ url }, (_erro, o) => (opcoes = o));
  return opcoes;
};

describe('Funcionalidade: CORS por rota (RNF05)', () => {
  it('Cenário: página pública aberta só para leitura, sem credenciais', () =>
    expect(opcoesPara('/v1/publico/filiais/x')).toEqual({
      origin: '*',
      methods: ['GET', 'HEAD'],
      credentials: false,
    }));

  it.each(['/v1/painel/filiais', '/v1/auth/login'])(
    'Cenário: %s só para a allowlist, com credenciais',
    (url) =>
      expect(opcoesPara(url)).toMatchObject({ origin: ['https://painel.tabloide.app'], credentials: true }),
  );

  it.each(['/v1/admin/metricas', '/v1/saude/pronto', ''])('Cenário: "%s" sem CORS', (url) =>
    expect(opcoesPara(url)).toEqual({ origin: false }),
  );
});

describe('Funcionalidade: Timeouts do servidor HTTP', () => {
  it('Cenário: requisição 30 s, headers 15 s e keep-alive 65 s', () => {
    const servidor = {} as Server;
    configurarTimeouts(servidor);
    expect(servidor).toMatchObject({
      requestTimeout: 30_000,
      headersTimeout: 15_000,
      keepAliveTimeout: 65_000,
    });
  });
});
