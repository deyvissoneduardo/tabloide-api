import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { AppConfig } from '../../config/app.config';
import { ErroView } from './erro.view';

/** Nome do esquema de segurança usado em @ApiBearerAuth nos controllers do painel. */
export const ESQUEMA_JWT = 'jwt';
/** Fora do prefixo v1: /docs (UI) e /docs-json (spec). */
export const CAMINHO_DOCS = 'docs';

export function criarDocumentoOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Tabloide Digital API')
    .setDescription(
      'Painel do lojista (JWT), autenticação e página pública por filial. ' +
        'Erros seguem { erro: { codigo, mensagem, detalhes? } }; valores em centavos e datas YYYY-MM-DD.',
    )
    .setVersion('v1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, ESQUEMA_JWT)
    .build();
  return SwaggerModule.createDocument(app, config, { extraModels: [ErroView] });
}

/**
 * Registrado direto no Express, fora dos guards globais (JWT, throttler). Desligado por padrão
 * (SWAGGER_HABILITADO): a spec revela a superfície inteira da API.
 */
export function configurarSwagger(app: INestApplication): void {
  if (!app.get(AppConfig).swaggerHabilitado) return;
  SwaggerModule.setup(CAMINHO_DOCS, app, () => criarDocumentoOpenApi(app), {
    jsonDocumentUrl: `${CAMINHO_DOCS}-json`,
    raw: ['json'],
    swaggerOptions: { persistAuthorization: true },
  });
}
