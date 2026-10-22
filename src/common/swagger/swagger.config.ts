import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppConfig } from '../../config/app.config';
import { ErroView } from './erro.view';

/** Nome do esquema de segurança usado em @ApiBearerAuth nos controllers do painel. */
export const ESQUEMA_JWT = 'jwt';
/** Fora do prefixo v1: /docs (UI) e /docs-json (spec). */
export const CAMINHO_DOCS = 'docs';
/**
 * CSS/JS do Swagger UI vêm do CDN: na Vercel o swagger-ui-dist fica fora do bundle da função.
 * Manter na mesma versão do swagger-ui-dist instalado.
 */
const SWAGGER_UI_CDN = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.13';
const ASSETS_SWAGGER_UI = [
  'swagger-ui.css',
  'swagger-ui-bundle.js',
  'swagger-ui-standalone-preset.js',
  'favicon-32x32.png',
  'favicon-16x16.png',
];

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
  // antes do setup: o express atende na ordem de registro, então estes vencem o static do swagger
  for (const arquivo of ASSETS_SWAGGER_UI) {
    app.use(`/${CAMINHO_DOCS}/${arquivo}`, (_req: Request, res: Response) =>
      res.redirect(302, `${SWAGGER_UI_CDN}/${arquivo}`),
    );
  }
  SwaggerModule.setup(CAMINHO_DOCS, app, () => criarDocumentoOpenApi(app), {
    jsonDocumentUrl: `${CAMINHO_DOCS}-json`,
    raw: ['json'],
    swaggerOptions: { persistAuthorization: true },
  });
}
