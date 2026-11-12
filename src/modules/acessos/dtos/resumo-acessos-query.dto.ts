import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PeriodoAcessosQueryDto } from './periodo-acessos-query.dto';

export class ResumoAcessosQueryDto extends PeriodoAcessosQueryDto {
  /** Filtra total, porDia, iniciosPanfleto e pico; o ranking porFilial não muda (RN54). */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'filialId deve ser um UUID' })
  filialId?: string;
}
