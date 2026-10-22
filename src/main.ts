import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configurarApp } from './app.setup';
import { AppConfig } from './config/app.config';
import { configurarTimeouts } from './config/http.config';

async function bootstrap(): Promise<void> {
  const app = configurarApp(
    await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true }),
  );
  const config = app.get(AppConfig);
  await app.listen(config.porta);
  configurarTimeouts(app.getHttpServer());

  // rede de segurança: se a drenagem travar, o processo sai mesmo assim
  const { drenagemMs, timeoutMs } = config.desligamento;
  for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(sinal, () => setTimeout(() => process.exit(1), drenagemMs + timeoutMs).unref());
  }
}

// com bufferLogs, uma falha antes do listen sumiria sem log (ex.: banco recusando a conexão)
bootstrap().catch((erro: unknown) => {
  console.error('Falha ao iniciar a API:', erro);
  process.exit(1);
});
