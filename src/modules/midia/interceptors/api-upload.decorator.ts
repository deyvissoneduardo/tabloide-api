import { applyDecorators, type Type } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiExtraModels, getSchemaPath } from '@nestjs/swagger';

interface OpcoesApiUpload {
  /** Campo do arquivo: CAMPO_IMAGEM ou CAMPO_FOTO, o mesmo do interceptor da rota. */
  campo: string;
  obrigatorio: boolean;
  /** DTO cujos campos vão junto do arquivo no formulário. */
  dto?: Type<unknown>;
  /** A rota também aceita JSON sem arquivo (cadastro de produto, D4.1). */
  aceitaJson?: boolean;
}

/** Documenta o multipart dos Upload*Interceptor: um único arquivo, JPEG/PNG/WebP. */
export function ApiUpload({ campo, obrigatorio, dto, aceitaJson = false }: OpcoesApiUpload): MethodDecorator {
  const arquivo = {
    type: 'object' as const,
    required: obrigatorio ? [campo] : [],
    properties: {
      [campo]: { type: 'string', format: 'binary', description: 'Imagem JPEG, PNG ou WebP' },
    },
  };
  const decorators = [
    ApiConsumes('multipart/form-data', ...(aceitaJson ? ['application/json'] : [])),
    ApiBody({ schema: dto ? { allOf: [{ $ref: getSchemaPath(dto) }, arquivo] } : arquivo }),
  ];
  return applyDecorators(...(dto ? [ApiExtraModels(dto), ...decorators] : decorators));
}
