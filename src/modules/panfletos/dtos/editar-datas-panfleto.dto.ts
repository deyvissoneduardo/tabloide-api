import { ValidateIf } from 'class-validator';
import type { DataISO } from '../../../common/utils/date-only';
import { IsDataISO } from '../../../common/validators/is-data-iso.validator';
import { AoMenosUmCampo } from '../../../common/validators/validadores';

export class EditarDatasPanfletoDto {
  /** null não é aceito: o início é sempre preenchido (RN40). */
  @ValidateIf((o: EditarDatasPanfletoDto) => o.dataInicio !== undefined)
  @IsDataISO()
  dataInicio?: DataISO;

  /** null remove a data limite (D3.7); ausente mantém a atual. */
  @ValidateIf((o: EditarDatasPanfletoDto) => o.dataLimite !== undefined)
  @IsDataISO({ anulavel: true })
  dataLimite?: DataISO | null;

  @AoMenosUmCampo({ message: 'Informe dataInicio ou dataLimite.' })
  readonly corpo?: never;
}
