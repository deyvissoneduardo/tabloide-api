import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CodigoErro } from '../errors/codigos-erro';

/** Corpo de erro do AppExceptionFilter (ADR 0007); só documentação, nunca instanciado. */
export class ErroDetalheView {
  @ApiProperty({ enum: CodigoErro, enumName: 'CodigoErro' })
  codigo!: CodigoErro;

  @ApiProperty({ example: 'Dados inválidos.' })
  mensagem!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Contexto do erro, ex.: { campos: { nome: ["..."] } } em VALIDACAO_INVALIDA.',
  })
  detalhes?: Record<string, unknown>;
}

export class ErroView {
  @ApiProperty({ type: () => ErroDetalheView })
  erro!: ErroDetalheView;
}
