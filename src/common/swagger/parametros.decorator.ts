import { applyDecorators } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';

/** Parâmetros de rota lidos com ParseUuidOu404Pipe: UUID inválido responde 404, não 400. */
export function ApiParamUuid(...nomes: string[]): MethodDecorator & ClassDecorator {
  return applyDecorators(...nomes.map((name) => ApiParam({ name, format: 'uuid' })));
}
