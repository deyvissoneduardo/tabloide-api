import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import path from 'node:path';
import type { Env } from '../../config/env.schema';

export const ROTA_MIDIA_LOCAL = '/v1/midia-local';

/** Serve os arquivos do DiskStorageAdapter só em development; em test e production não registra nada. */
@Module({
  imports: [
    ServeStaticModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('NODE_ENV', { infer: true }) === 'development'
          ? [
              {
                rootPath: path.resolve(config.get('MIDIA_DIR_LOCAL', { infer: true })),
                serveRoot: ROTA_MIDIA_LOCAL,
                serveStaticOptions: { maxAge: 31_536_000_000, immutable: true, index: false },
              },
            ]
          : [],
    }),
  ],
})
export class MidiaLocalModule {}
