import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

export function configurarApp(app: NestExpressApplication): NestExpressApplication {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('v1');
  app.set('trust proxy', 1);
  app.enableShutdownHooks();
  return app;
}
