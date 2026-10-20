import { gzipSync } from 'node:zlib';
import type { INestApplication } from '@nestjs/common';
import { criarAppDeController } from '../../../../test/helpers/app-de-controller';
import { PublicoController } from '../controllers/publico.controller';
import { paginaNaoEncontrada, PublicoService } from '../services/publico.service';

describe('Funcionalidade: Respostas HTTP da página pública', () => {
  const publico = { obterPagina: jest.fn() };
  let app: INestApplication;
  let http: Awaited<ReturnType<typeof criarAppDeController>>['http'];

  beforeAll(async () => {
    ({ app, http } = await criarAppDeController({
      controllers: [PublicoController],
      providers: [{ provide: PublicoService, useValue: publico }],
    }));
  });
  beforeEach(() => {
    jest.resetAllMocks();
    publico.obterPagina.mockResolvedValue({
      corpo: '{"a":1}',
      corpoGzip: gzipSync('{"a":1}'),
      etag: 'W/"abc"',
    });
  });
  afterAll(() => app.close());

  const get = () => http().get('/v1/publico/filiais/k7Qm2xPa');

  describe('Cenário: 200 com corpo pré-serializado e headers de cache', () => {
    it('Então o corpo é exatamente o recebido do service', async () => {
      const r = await get();
      expect(r.status).toBe(200);
      expect(r.text).toBe('{"a":1}');
      expect(r.headers['cache-control']).toBe('public, max-age=30, stale-while-revalidate=300');
      expect(r.headers.etag).toBe('W/"abc"');
      expect(r.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(publico.obterPagina).toHaveBeenCalledWith('k7Qm2xPa');
    });
  });

  describe('Cenário: gzip pré-comprimido conforme o Accept-Encoding', () => {
    it('Então com gzip vai o buffer do cache e sem gzip vai o texto', async () => {
      const comGzip = await get().set('Accept-Encoding', 'gzip');
      expect(comGzip.headers['content-encoding']).toBe('gzip');
      expect(comGzip.headers.vary).toContain('Accept-Encoding');
      expect(comGzip.text).toBe('{"a":1}');
      const semGzip = await get().set('Accept-Encoding', 'identity');
      expect(semGzip.headers['content-encoding']).toBeUndefined();
      expect(semGzip.text).toBe('{"a":1}');
    });
  });

  describe('Esquema do Cenário: If-None-Match', () => {
    it.each([
      ['W/"abc"', 304],
      ['"abc"', 304],
      ['W/"xyz", W/"abc"', 304],
      ['*', 304],
      ['W/"xyz"', 200],
    ])('Dado "%s", então %i', async (inm, status) =>
      expect((await get().set('If-None-Match', inm)).status).toBe(status),
    );
  });

  describe('Cenário: 304 sem corpo', () => {
    it('Então corpo vazio com ETag e Cache-Control', async () => {
      const r = await get().set('If-None-Match', 'W/"abc"');
      expect(r.text).toBe('');
      expect(r.headers.etag).toBe('W/"abc"');
      expect(r.headers['cache-control']).toBeDefined();
    });
  });

  describe('Cenário: 404 com cache curto', () => {
    it('Então "Página não encontrada." com max-age=10', async () => {
      publico.obterPagina.mockRejectedValue(paginaNaoEncontrada());
      const r = await get();
      expect(r.status).toBe(404);
      expect(r.body).toEqual({
        erro: { codigo: 'RECURSO_NAO_ENCONTRADO', mensagem: 'Página não encontrada.' },
      });
      expect(r.headers['cache-control']).toBe('public, max-age=10');
    });
  });

  describe('Cenário: rota pública não exige autenticação (RN27)', () => {
    it('Então a classe é marcada com @Public()', () =>
      expect(Reflect.getMetadata('isPublic', PublicoController)).toBe(true));
  });
});
