import { applyDecorators, type Type } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { CodigoErro, MENSAGEM_POR_CODIGO, STATUS_POR_CODIGO } from '../errors/codigos-erro';
import { ErroView } from './erro.view';
import { ESQUEMA_JWT } from './swagger.config';

/** Controller do painel: JWT e os erros que qualquer rota autenticada pode devolver. */
export function ApiPainel(tag: string): ClassDecorator {
  return applyDecorators(
    ApiTags(tag),
    ApiBearerAuth(ESQUEMA_JWT),
    ApiRespostasDeErro(CodigoErro.NAO_AUTENTICADO, CodigoErro.MUITAS_TENTATIVAS),
  );
}

/** Uma resposta por status HTTP, com um exemplo por código de negócio (status de STATUS_POR_CODIGO). */
export function ApiRespostasDeErro(...codigos: CodigoErro[]): MethodDecorator & ClassDecorator {
  const porStatus = new Map<number, CodigoErro[]>();
  for (const codigo of new Set(codigos)) {
    const status = STATUS_POR_CODIGO[codigo];
    porStatus.set(status, [...(porStatus.get(status) ?? []), codigo]);
  }
  return applyDecorators(
    ...[...porStatus].map(([status, doStatus]) =>
      ApiResponse({
        status,
        description: doStatus.join(' | '),
        type: ErroView,
        examples: Object.fromEntries(
          doStatus.map((codigo) => [
            codigo,
            { summary: codigo, value: { erro: { codigo, mensagem: MENSAGEM_POR_CODIGO[codigo] } } },
          ]),
        ),
      }),
    ),
  );
}

/** Pagina<T> de paginacao-query.dto.ts: itens + total, pagina e porPagina. */
export function ApiRespostaPaginada(view: Type<unknown>): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(view),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['itens', 'total', 'pagina', 'porPagina'],
        properties: {
          itens: { type: 'array', items: { $ref: getSchemaPath(view) } },
          total: { type: 'integer', example: 1 },
          pagina: { type: 'integer', example: 1 },
          porPagina: { type: 'integer', example: 50 },
        },
      },
    }),
  );
}
