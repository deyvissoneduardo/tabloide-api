import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { ApiDataISO } from '../../../common/swagger/data-iso.decorator';
import type { DataISO } from '../../../common/utils/date-only';
import { IsDataISO } from '../../../common/validators/is-data-iso.validator';
import { PERIODOS_PREDEFINIDOS } from '../domain/periodo-relatorio';

/** §3.2: periodo OU inicio+fim. A regra entre campos fica em lerPeriodo (PERIODO_INVALIDO). */
export class PeriodoAcessosQueryDto {
  @ApiPropertyOptional({ enum: PERIODOS_PREDEFINIDOS, description: '1 = hoje. Padrão 30 sem inicio/fim.' })
  @IsOptional()
  @Type(() => Number)
  @IsIn(PERIODOS_PREDEFINIDOS, { message: 'periodo deve ser 1, 7, 15 ou 30' })
  periodo?: number;

  @ApiDataISO({ obrigatorio: false })
  @IsOptional()
  @IsDataISO()
  inicio?: DataISO;

  @ApiDataISO({ obrigatorio: false })
  @IsOptional()
  @IsDataISO()
  fim?: DataISO;
}
