import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { PaginacaoQueryDto } from '../../../common/dtos/paginacao-query.dto';
import type { Situacao } from '../domain/vigencia.types';

export const SITUACOES: readonly Situacao[] = ['AGENDADO', 'VIGENTE', 'VENCIDO', 'EXCLUIDO'];

/** situacao em CSV (ex.: "VIGENTE,AGENDADO"); ausente lista todos os não excluídos. Panfletos e produtos. */
export class ListarPorSituacaoQueryDto extends PaginacaoQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      : value,
  )
  @IsIn(SITUACOES, { each: true, message: 'situacao deve conter AGENDADO, VIGENTE, VENCIDO ou EXCLUIDO' })
  situacao?: Situacao[];
}
