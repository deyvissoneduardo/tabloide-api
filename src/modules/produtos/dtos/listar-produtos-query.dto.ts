import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { TextoOpcional } from '../../../common/validators/transformacoes';
import { ListarPorSituacaoQueryDto } from '../../vigencia/dtos/listar-por-situacao-query.dto';

export class ListarProdutosQueryDto extends ListarPorSituacaoQueryDto {
  @IsOptional()
  @IsUUID('7', { message: 'categoriaId inválido.' })
  categoriaId?: string;

  /** Sem acento e sem diferenciar maiúsculas (D4.2). */
  @TextoOpcional()
  @IsOptional()
  @IsString()
  @Length(1, 60, { message: 'A busca deve ter até 60 caracteres.' })
  busca?: string;
}
