import { Module } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { AppConfig } from '../../config/app.config';
import {
  UploadFotoInterceptor,
  UploadFotoOpcionalInterceptor,
  UploadImagemInterceptor,
} from './interceptors/upload-imagem.interceptor';
import { ImageProcessor } from './services/image-processor.service';
import { MidiaService } from './services/midia.service';
import { DiskStorageAdapter } from './storage/disk-storage.adapter';
import { STORAGE_PORT, type StoragePort } from './storage/storage.port';
import { SupabaseStorageAdapter, type ClienteStorageSupabase } from './storage/supabase-storage.adapter';

export function criarStorage(config: AppConfig): StoragePort {
  if (config.storageDriver === 'supabase') {
    const { url, chaveServico, bucket } = config.supabase;
    const cliente = createClient(url, chaveServico, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return new SupabaseStorageAdapter(cliente as unknown as ClienteStorageSupabase, url, bucket);
  }
  return new DiskStorageAdapter(config.midiaLocal.diretorio, config.midiaLocal.urlBase);
}

@Module({
  providers: [
    ImageProcessor,
    MidiaService,
    UploadImagemInterceptor,
    UploadFotoOpcionalInterceptor,
    UploadFotoInterceptor,
    { provide: STORAGE_PORT, inject: [AppConfig], useFactory: criarStorage },
  ],
  exports: [MidiaService, UploadImagemInterceptor, UploadFotoOpcionalInterceptor, UploadFotoInterceptor],
})
export class MidiaModule {}
