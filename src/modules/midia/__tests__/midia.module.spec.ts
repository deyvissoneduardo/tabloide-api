import type { AppConfig } from '../../../config/app.config';
import { validarEnv } from '../../../config/env.schema';
import { criarStorage } from '../midia.module';
import { DiskStorageAdapter } from '../storage/disk-storage.adapter';
import { SupabaseStorageAdapter } from '../storage/supabase-storage.adapter';

const envMinimo = {
  DATABASE_URL: 'postgres://u:s@localhost/db',
  JWT_SECRET: 'x'.repeat(32),
  ADMIN_API_KEY: 'k'.repeat(32),
  PUBLIC_BASE_URL: 'https://tabloide.app',
};

describe('Funcionalidade: Escolha do adapter de armazenamento', () => {
  describe('Esquema do Cenário: driver por ambiente', () => {
    it('Então disco resolve para DiskStorageAdapter', () =>
      expect(
        criarStorage({
          storageDriver: 'disco',
          midiaLocal: { diretorio: '/tmp/x', urlBase: 'http://localhost' },
        } as AppConfig),
      ).toBeInstanceOf(DiskStorageAdapter));

    it('E supabase resolve para SupabaseStorageAdapter', () =>
      expect(
        criarStorage({
          storageDriver: 'supabase',
          supabase: { url: 'https://xyz.supabase.co', chaveServico: 'k', bucket: 'midia' },
        } as AppConfig),
      ).toBeInstanceOf(SupabaseStorageAdapter));
  });

  describe('Cenário: production não aceita disco', () => {
    it('Então a validação do env falha citando STORAGE_DRIVER', () =>
      expect(() => validarEnv({ ...envMinimo, NODE_ENV: 'production', STORAGE_DRIVER: 'disco' })).toThrow(
        'STORAGE_DRIVER',
      ));
  });

  describe('Cenário: supabase exige URL e chave', () => {
    it('Então faltar as duas é erro', () =>
      expect(() => validarEnv({ ...envMinimo, STORAGE_DRIVER: 'supabase' })).toThrow(
        /SUPABASE_URL[\s\S]*SUPABASE_SERVICE_ROLE_KEY/,
      ));

    it('E com as duas o env é válido em produção', () =>
      expect(
        validarEnv({
          ...envMinimo,
          NODE_ENV: 'production',
          STORAGE_DRIVER: 'supabase',
          SUPABASE_URL: 'https://xyz.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'k',
          CORS_ORIGENS_PAINEL: 'https://painel.tabloide.app',
        }).STORAGE_DRIVER,
      ).toBe('supabase'));
  });

  describe('Cenário: padrões de mídia', () => {
    it('Então disco, bucket midia, 10 MB, 50 MP e concorrência 2', () =>
      expect(validarEnv(envMinimo)).toMatchObject({
        STORAGE_DRIVER: 'disco',
        SUPABASE_BUCKET: 'midia',
        MAX_IMAGEM_BYTES: 10_485_760,
        IMAGEM_MAX_PIXELS: 50_000_000,
        IMAGEM_CONCORRENCIA: 2,
      }));
  });
});
