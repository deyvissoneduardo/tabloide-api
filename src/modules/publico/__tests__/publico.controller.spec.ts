import { gzipSync } from 'node:zlib';
import type { INestApplication } from '@nestjs/common';
import { criarAppDeController } from '../../../../test/helpers/app-de-controller';
import { RegistroAcessosService } from '../../acessos/services/registro-acessos.service';
import { PublicoController } from '../controllers/publico.controller';
import { paginaNaoEncontrada, PublicoService } from '../services/publico.service';

describe('Funcionalidade: Respostas HTTP da página pública', () => {
  const publico = { obterPagina: jest.fn() };
  const registroAcessos = { registrar: jest.fn() };
  let app: INestApplication;
  let http: Awaited<ReturnType<typeof criarAppDeController>>['http'];

  beforeAll(async () => {
    ({ app, http } = await criarAppDeController({
      controllers: [PublicoController],
      providers: [
        { provide: PublicoService, useValue: publico },
        { provide: RegistroAcessosService, useValue: registroAcessos },
      ],
    }));
  });
  beforeEach(() => {
    jest.resetAllMocks();
    publico.obterPagina.mockResolvedValue({
      corpo: '{"a":1}',
      corpoGzip: gzipSync('{"a":1}'),
      etag: 'W/"abc"',
      tenantId: 't1',
      filialId: 'f1',
      fuso: 'America/Sao_Paulo',
    });
    registroAcessos.registrar.mockResolvedValue(undefined);
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

  describe('Funcionalidade: contar o acesso (RN50)', () => {
    const NAVEGADOR = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) Safari/604.1';

    it('Dado um navegador, então registra com os dados da página montada', async () => {
      expect((await get().set('User-Agent', NAVEGADOR)).status).toBe(200);
      expect(registroAcessos.registrar).toHaveBeenCalledWith({
        tenantId: 't1',
        filialId: 'f1',
        fuso: 'America/Sao_Paulo',
      });
    });

    it('Dado um 304, então também registra', async () => {
      const r = await get().set('User-Agent', NAVEGADOR).set('If-None-Match', 'W/"abc"');
      expect(r.status).toBe(304);
      expect(registroAcessos.registrar).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['robô', (r: ReturnType<typeof get>) => r.set('User-Agent', 'WhatsApp/2.23')],
      ['sem user-agent', (r: ReturnType<typeof get>) => r.set('User-Agent', '')],
      [
        'origem=painel',
        (r: ReturnType<typeof get>) => r.set('User-Agent', NAVEGADOR).query({ origem: 'painel' }),
      ],
    ])('Dado %s, então responde 200 e não registra', async (_nome, montar) => {
      expect((await montar(get())).status).toBe(200);
      expect(registroAcessos.registrar).not.toHaveBeenCalled();
    });

    it('Dado HEAD, então não registra', async () => {
      expect((await http().head('/v1/publico/filiais/k7Qm2xPa').set('User-Agent', NAVEGADOR)).status).toBe(
        200,
      );
      expect(registroAcessos.registrar).not.toHaveBeenCalled();
    });

    it('Dado origem desconhecida, então registra normalmente', async () => {
      await get().set('User-Agent', NAVEGADOR).query({ origem: 'qr' });
      expect(registroAcessos.registrar).toHaveBeenCalledTimes(1);
    });

    it('Dado 404, então não registra', async () => {
      publico.obterPagina.mockRejectedValue(paginaNaoEncontrada());
      expect((await get().set('User-Agent', NAVEGADOR)).status).toBe(404);
      expect(registroAcessos.registrar).not.toHaveBeenCalled();
    });

    it('Dado o registro demorando, então a resposta sai quando ele resolve (o limite é do service)', async () => {
      let liberar!: () => void;
      registroAcessos.registrar.mockReturnValue(new Promise<void>((r) => (liberar = r)));
      const pendente = get()
        .set('User-Agent', NAVEGADOR)
        .then((r) => r);
      await new Promise((r) => setTimeout(r, 20));
      liberar();
      expect((await pendente).status).toBe(200);
    });
  });
});
