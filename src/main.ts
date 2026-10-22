import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import { configurarApp } from './app.setup';
import { AppConfig } from './config/app.config';
import { configurarTimeouts } from './config/http.config';

async function criarApp(): Promise<NestExpressApplication> {
  return configurarApp(await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true }));
}

async function bootstrap(): Promise<void> {
  const app = await criarApp();
  const config = app.get(AppConfig);
  await app.listen(config.porta);
  configurarTimeouts(app.getHttpServer());

  // rede de segurança: se a drenagem travar, o processo sai mesmo assim
  const { drenagemMs, timeoutMs } = config.desligamento;
  for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(sinal, () => setTimeout(() => process.exit(1), drenagemMs + timeoutMs).unref());
  }
}

// Vercel: importa este módulo e chama o handler exportado; o app sobe uma vez por instância
let appPronto: Promise<NestExpressApplication> | undefined;

export default async function handler(req: Request, res: Response): Promise<void> {
  appPronto ??= criarApp()
    .then((app) => app.init())
    .catch((erro: unknown) => {
      appPronto = undefined;
      console.error('Falha ao iniciar a API:', erro);
      throw erro;
    });
  const app = await appPronto;
  app.getHttpAdapter().getInstance()(req, res);
}

// `node dist/main.js` (local, container): servidor HTTP próprio
if (require.main === module) {
  bootstrap().catch((erro: unknown) => {
    console.error('Falha ao iniciar a API:', erro);
    process.exit(1);
  });
}
