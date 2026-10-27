import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsUUID, ValidateNested } from 'class-validator';

export class CategoriaDaEstruturaDto {
  @IsUUID('7', { message: 'id de categoria inválido.' })
  id!: string;

  /** Ids dos produtos desta categoria, na ordem da página. */
  @IsArray({ message: 'produtos deve ser uma lista.' })
  @ArrayMaxSize(2000, { message: 'No máximo 2000 produtos por categoria.' })
  @IsUUID('7', { each: true, message: 'id de produto inválido.' })
  produtos!: string[];
}

/**
 * RN45: substitui a ordem da filial. Ids repetidos não são barrados aqui: viram
 * ESTRUTURA_INVALIDA com o id, mais útil para o front.
 */
export class SalvarEstruturaDto {
  @IsArray({ message: 'categorias deve ser uma lista.' })
  @ArrayMaxSize(500, { message: 'No máximo 500 categorias.' })
  @ValidateNested({ each: true })
  @Type(() => CategoriaDaEstruturaDto)
  categorias!: CategoriaDaEstruturaDto[];
}
