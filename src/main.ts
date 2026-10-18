import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configurarApp } from './app.setup';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = configurarApp(
    await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true }),
  );
  await app.listen(app.get(ConfigService<Env, true>).get('PORT', { infer: true }));
}

void bootstrap();
