import { ApiHideProperty } from '@nestjs/swagger';
import { IsInt, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
import { ApiDataISO } from '../../../common/swagger/data-iso.decorator';
import { CENTAVOS_MAXIMO } from '../../../common/utils/money';
import type { DataISO } from '../../../common/utils/date-only';
import { IsDataISO } from '../../../common/validators/is-data-iso.validator';
import { NormalizarEspacos, TextoOpcional } from '../../../common/validators/transformacoes';
import { AoMenosUmCampo } from '../../../common/validators/validadores';

const presente = (campo: keyof EditarProdutoDto) =>
  ValidateIf((o: EditarProdutoDto) => o[campo] !== undefined);
const preenchido = (campo: keyof EditarProdutoDto) =>
  ValidateIf((o: EditarProdutoDto) => o[campo] !== undefined && o[campo] !== null);

/**
 * PATCH parcial (D4.8): ausente mantém, null limpa os opcionais. nome, categoriaId,
 * precoPromocionalCentavos e dataInicio não aceitam null. A foto tem rota própria.
 */
export class EditarProdutoDto {
  @presente('nome')
  @NormalizarEspacos()
  @IsString({ message: 'Informe o nome do produto.' })
  @Length(1, 120, { message: 'O nome deve ter de 1 a 120 caracteres.' })
  nome?: string;

  @presente('categoriaId')
  @IsUUID('7', { message: 'categoriaId inválido.' })
  categoriaId?: string;

  @presente('precoPromocionalCentavos')
  @IsInt({ message: 'precoPromocionalCentavos deve ser um inteiro em centavos.' })
  @Min(1, { message: 'precoPromocionalCentavos deve ser maior que zero.' })
  @Max(CENTAVOS_MAXIMO, { message: `precoPromocionalCentavos deve ser no máximo ${CENTAVOS_MAXIMO}.` })
  precoPromocionalCentavos?: number;

  @preenchido('precoOriginalCentavos')
  @IsInt({ message: 'precoOriginalCentavos deve ser um inteiro em centavos.' })
  @Min(2, { message: 'precoOriginalCentavos deve ser maior que 1.' })
  @Max(CENTAVOS_MAXIMO, { message: `precoOriginalCentavos deve ser no máximo ${CENTAVOS_MAXIMO}.` })
  precoOriginalCentavos?: number | null;

  @preenchido('quantidade')
  @TextoOpcional(null)
  @IsString()
  @Length(1, 40, { message: 'A quantidade deve ter até 40 caracteres.' })
  quantidade?: string | null;

  @preenchido('descricao')
  @TextoOpcional(null)
  @IsString()
  @Length(1, 500, { message: 'A descrição deve ter até 500 caracteres.' })
  descricao?: string | null;

  @preenchido('observacao')
  @TextoOpcional(null)
  @IsString()
  @Length(1, 200, { message: 'A observação deve ter até 200 caracteres.' })
  observacao?: string | null;

  /** null não é aceito: todo produto tem início (RN40). */
  @presente('dataInicio')
  @IsDataISO()
  @ApiDataISO({ obrigatorio: false })
  dataInicio?: DataISO;

  @presente('dataLimite')
  @IsDataISO({ anulavel: true })
  @ApiDataISO({ obrigatorio: false, anulavel: true })
  dataLimite?: DataISO | null;

  @AoMenosUmCampo()
  @ApiHideProperty()
  readonly corpo?: never;
}
