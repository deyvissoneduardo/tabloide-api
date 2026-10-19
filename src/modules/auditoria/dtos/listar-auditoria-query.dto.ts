import { IsIn, IsUUID } from 'class-validator';
import { PaginacaoQueryDto } from '../../../common/dtos/paginacao-query.dto';
import type { EntidadeAuditada } from '../models/auditoria-alteracao.model';

export const ENTIDADES_AUDITADAS: readonly EntidadeAuditada[] = ['FILIAL', 'PANFLETO', 'PRODUTO'];

export class ListarAuditoriaQueryDto extends PaginacaoQueryDto {
  @IsIn(ENTIDADES_AUDITADAS, { message: 'entidade deve ser FILIAL, PANFLETO ou PRODUTO' })
  entidade!: EntidadeAuditada;

  @IsUUID('7', { message: 'entidadeId inválido' })
  entidadeId!: string;
}
