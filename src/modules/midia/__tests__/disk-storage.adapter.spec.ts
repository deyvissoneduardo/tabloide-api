import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DiskStorageAdapter } from '../storage/disk-storage.adapter';

describe('Funcionalidade: Armazenar em disco (dev/test)', () => {
  let raiz: string;
  let adapter: DiskStorageAdapter;

  beforeEach(async () => {
    raiz = await mkdtemp(path.join(os.tmpdir(), 'midia-'));
    adapter = new DiskStorageAdapter(raiz, 'http://localhost:3000/v1/midia-local');
  });
  afterEach(() => rm(raiz, { recursive: true, force: true }));

  describe('Cenário: grava criando diretórios', () => {
    it('Então o arquivo existe com o conteúdo enviado', async () => {
      await adapter.salvar(Buffer.from('conteudo'), 't1/panfleto/x.webp');
      expect(await readFile(path.join(raiz, 't1/panfleto/x.webp'), 'utf8')).toBe('conteudo');
    });
  });

  describe('Cenário: não sobrescreve', () => {
    it('Então falha e o conteúdo original permanece', async () => {
      await adapter.salvar(Buffer.from('original'), 't1/panfleto/x.webp');
      await expect(adapter.salvar(Buffer.from('novo'), 't1/panfleto/x.webp')).rejects.toThrow();
      expect(await readFile(path.join(raiz, 't1/panfleto/x.webp'), 'utf8')).toBe('original');
    });
  });

  describe('Cenário: path traversal', () => {
    it('Então falha e nada é gravado fora da raiz', async () => {
      await expect(adapter.salvar(Buffer.from('x'), '../fora.webp')).rejects.toThrow(/fora da raiz/);
      await expect(stat(path.join(raiz, '..', 'fora.webp'))).rejects.toThrow();
    });
  });

  describe('Cenário: URL pública', () => {
    it('Então base local + caminho', () =>
      expect(adapter.urlPublica('t1/logo/a.webp')).toBe(
        'http://localhost:3000/v1/midia-local/t1/logo/a.webp',
      ));
  });
});
