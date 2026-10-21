import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { MetricasService } from './common/observabilidade/metricas.service';
import { medirDuracao } from './common/observabilidade/medir-duracao.middleware';
import { configurarSwagger } from './common/swagger/swagger.config';
import { AppConfig } from './config/app.config';
import { corsPorRota } from './config/http.config';

/** Configuração HTTP comum ao main.ts e aos testes de integração. */
export function configurarApp(app: NestExpressApplication): NestExpressApplication {
  const config = app.get(AppConfig);
  app.useLogger(app.get(Logger));
  app.set('trust proxy', config.trustProxy);
  // só a página pública tem ETag, calculado sobre o conteúdo; nada de ETag automático em 404
  app.set('etag', false);
  // a API só fala JSON: sem CSP; cross-origin para o front em outro domínio ler a página pública
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression({ threshold: 1024 }));
  app.use(medirDuracao(app.get(MetricasService)));
  // uploads seguem os limites do multer, independentes deste
  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { limit: '100kb', extended: false });
  app.enableCors(corsPorRota(config.corsOrigensPainel));
  app.setGlobalPrefix('v1');
  // depois do prefixo, para a spec sair com /v1 nos paths
  configurarSwagger(app);
  app.enableShutdownHooks();
  return app;
}
