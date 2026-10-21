import { ApiHideProperty } from '@nestjs/swagger';
import { ValidateIf } from 'class-validator';
import { ApiDataISO } from '../../../common/swagger/data-iso.decorator';
import type { DataISO } from '../../../common/utils/date-only';
import { IsDataISO } from '../../../common/validators/is-data-iso.validator';
import { AoMenosUmCampo } from '../../../common/validators/validadores';

export class EditarDatasPanfletoDto {
  /** null não é aceito: o início é sempre preenchido (RN40). */
  @ValidateIf((o: EditarDatasPanfletoDto) => o.dataInicio !== undefined)
  @IsDataISO()
  @ApiDataISO({ obrigatorio: false })
  dataInicio?: DataISO;

  /** null remove a data limite (D3.7); ausente mantém a atual. */
  @ValidateIf((o: EditarDatasPanfletoDto) => o.dataLimite !== undefined)
  @IsDataISO({ anulavel: true })
  @ApiDataISO({ obrigatorio: false, anulavel: true })
  dataLimite?: DataISO | null;

  @AoMenosUmCampo({ message: 'Informe dataInicio ou dataLimite.' })
  @ApiHideProperty()
  readonly corpo?: never;
}
