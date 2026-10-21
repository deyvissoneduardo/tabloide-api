import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { ApiDataISO } from '../../../common/swagger/data-iso.decorator';
import { CENTAVOS_MAXIMO } from '../../../common/utils/money';
import type { DataISO } from '../../../common/utils/date-only';
import { IsDataISO } from '../../../common/validators/is-data-iso.validator';
import {
  InteiroDeFormulario,
  NormalizarEspacos,
  TextoOpcional,
} from '../../../common/validators/transformacoes';

const vazioParaUndefined = () => Transform(({ value }) => (value === '' ? undefined : value));

/**
 * JSON ou campos de multipart (D4.1); a foto chega pelo interceptor. "Original maior que o
 * promocional" (RN21) e as regras de data no fuso da filial ficam no service.
 */
export class CriarProdutoDto {
  @NormalizarEspacos()
  @IsString({ message: 'Informe o nome do produto.' })
  @Length(1, 120, { message: 'O nome deve ter de 1 a 120 caracteres.' })
  nome!: string;

  @IsUUID('7', { message: 'categoriaId inválido.' })
  categoriaId!: string;

  @InteiroDeFormulario()
  @IsInt({ message: 'precoPromocionalCentavos deve ser um inteiro em centavos.' })
  @Min(1, { message: 'precoPromocionalCentavos deve ser maior que zero.' })
  @Max(CENTAVOS_MAXIMO, { message: `precoPromocionalCentavos deve ser no máximo ${CENTAVOS_MAXIMO}.` })
  precoPromocionalCentavos!: number;

  @vazioParaUndefined()
  @InteiroDeFormulario()
  @IsOptional()
  @IsInt({ message: 'precoOriginalCentavos deve ser um inteiro em centavos.' })
  @Min(2, { message: 'precoOriginalCentavos deve ser maior que 1.' })
  @Max(CENTAVOS_MAXIMO, { message: `precoOriginalCentavos deve ser no máximo ${CENTAVOS_MAXIMO}.` })
  precoOriginalCentavos?: number;

  @TextoOpcional()
  @IsOptional()
  @IsString()
  @Length(1, 40, { message: 'A quantidade deve ter até 40 caracteres.' })
  quantidade?: string;

  @TextoOpcional()
  @IsOptional()
  @IsString()
  @Length(1, 500, { message: 'A descrição deve ter até 500 caracteres.' })
  descricao?: string;

  @TextoOpcional()
  @IsOptional()
  @IsString()
  @Length(1, 200, { message: 'A observação deve ter até 200 caracteres.' })
  observacao?: string;

  @vazioParaUndefined()
  @IsOptional()
  @IsDataISO()
  @ApiDataISO({ obrigatorio: false })
  dataInicio?: DataISO;

  @vazioParaUndefined()
  @IsOptional()
  @IsDataISO()
  @ApiDataISO({ obrigatorio: false })
  dataLimite?: DataISO;
}
