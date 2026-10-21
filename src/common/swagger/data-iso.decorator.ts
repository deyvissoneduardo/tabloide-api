import { ApiProperty } from '@nestjs/swagger';

/** DataISO é string com marca de tipo: o plugin do Swagger a enxerga como Object. */
export function ApiDataISO(opcoes: { obrigatorio?: boolean; anulavel?: boolean } = {}): PropertyDecorator {
  return ApiProperty({
    type: String,
    format: 'date',
    example: '2026-10-21',
    required: opcoes.obrigatorio ?? true,
    nullable: opcoes.anulavel ?? false,
  });
}
