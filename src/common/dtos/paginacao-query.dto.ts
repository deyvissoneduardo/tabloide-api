import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const POR_PAGINA_PADRAO = 50;
export const POR_PAGINA_MAXIMO = 100;

export class PaginacaoQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pagina deve ser inteiro ≥ 1' })
  @Min(1, { message: 'pagina deve ser inteiro ≥ 1' })
  pagina: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: `porPagina deve estar entre 1 e ${POR_PAGINA_MAXIMO}` })
  @Min(1, { message: `porPagina deve estar entre 1 e ${POR_PAGINA_MAXIMO}` })
  @Max(POR_PAGINA_MAXIMO, { message: `porPagina deve estar entre 1 e ${POR_PAGINA_MAXIMO}` })
  porPagina: number = POR_PAGINA_PADRAO;
}

export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  porPagina: number;
}
