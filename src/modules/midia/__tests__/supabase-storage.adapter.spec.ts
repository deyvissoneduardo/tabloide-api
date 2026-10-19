import { Logger } from '@nestjs/common';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { SupabaseStorageAdapter, type ClienteStorageSupabase } from '../storage/supabase-storage.adapter';

const CHAVE_SERVICO = 'chave-de-servico-super-secreta';

describe('Funcionalidade: Armazenar no Supabase Storage', () => {
  const upload = jest.fn();
  const from = jest.fn(() => ({ upload }));
  const cliente = { storage: { from } } as unknown as ClienteStorageSupabase;
  const esperar = jest.fn(async () => undefined);
  const adapter = new SupabaseStorageAdapter(cliente, 'https://xyz.supabase.co', 'midia', esperar);
  let logErro: jest.SpyInstance;

  beforeEach(() => {
    upload.mockReset();
    from.mockClear();
    esperar.mockClear();
    logErro = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => logErro.mockRestore());

  const salvar = () => adapter.salvar(Buffer.from('x'), 't1/panfleto/abc.webp', 'image/webp');

  describe('Cenário: upload com cache longo e sem sobrescrita', () => {
    it('Então usa o bucket midia, upsert false e cacheControl de 1 ano', async () => {
      upload.mockResolvedValue({ error: null });
      await salvar();
      expect(from).toHaveBeenCalledWith('midia');
      expect(upload).toHaveBeenCalledWith('t1/panfleto/abc.webp', Buffer.from('x'), {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: false,
      });
    });
  });

  describe('Cenário: falha transitória seguida de sucesso', () => {
    it('Então não há erro e o upload é tentado 2 vezes após 200 ms', async () => {
      upload.mockResolvedValueOnce({ error: { message: 'unavailable', status: 503 } });
      upload.mockResolvedValueOnce({ error: null });
      await expect(salvar()).resolves.toBeUndefined();
      expect(upload).toHaveBeenCalledTimes(2);
      expect(esperar).toHaveBeenCalledWith(200);
    });
  });

  describe('Cenário: falha persistente de rede', () => {
    it('Então ARMAZENAMENTO_INDISPONIVEL após 2 tentativas', async () => {
      upload.mockResolvedValue({ error: { message: 'fetch failed' } });
      await expect(salvar()).rejects.toMatchObject({
        codigo: CodigoErro.ARMAZENAMENTO_INDISPONIVEL,
        status: 503,
      });
      expect(upload).toHaveBeenCalledTimes(2);
    });
  });

  describe.each([
    ['erro de configuração', { message: 'Bucket not found', status: 400 }],
    ['caminho já existente', { message: 'The resource already exists', status: 409 }],
  ])('Cenário: %s', (_nome, erro) => {
    it('Então erro interno sem nova tentativa', async () => {
      upload.mockResolvedValue({ error: erro });
      await expect(salvar()).rejects.toThrow(/falha ao gravar mídia no Supabase/);
      await expect(salvar()).rejects.not.toHaveProperty('codigo');
      expect(upload).toHaveBeenCalledTimes(2);
      expect(esperar).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: URL pública sem chamada de rede', () => {
    it('Então monta a URL do bucket público com os segmentos codificados', () => {
      expect(adapter.urlPublica('t1/logo/a b.webp')).toBe(
        'https://xyz.supabase.co/storage/v1/object/public/midia/t1/logo/a%20b.webp',
      );
      expect(from).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: chave de serviço nunca é logada', () => {
    it('Então o log de falha não contém a chave', async () => {
      upload.mockResolvedValue({ error: { message: 'Bucket not found', status: 400 } });
      await salvar().catch(() => undefined);
      expect(logErro).toHaveBeenCalled();
      expect(JSON.stringify(logErro.mock.calls)).not.toContain(CHAVE_SERVICO);
    });
  });

  describe('Cenário: espera padrão real', () => {
    it('Então sem função de espera injetada a repetição ainda acontece', async () => {
      const real = new SupabaseStorageAdapter(cliente, 'https://xyz.supabase.co', 'midia');
      upload
        .mockResolvedValueOnce({ error: { message: 'x', status: 500 } })
        .mockResolvedValueOnce({ error: null });
      await expect(real.salvar(Buffer.from('x'), 'a.webp', 'image/webp')).resolves.toBeUndefined();
    });
  });
});
