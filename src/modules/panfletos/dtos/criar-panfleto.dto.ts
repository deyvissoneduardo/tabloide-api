import { Transform } from 'class-transformer';
import { IsOptional } from 'class-validator';
import { ApiDataISO } from '../../../common/swagger/data-iso.decorator';
import type { DataISO } from '../../../common/utils/date-only';
import { IsDataISO } from '../../../common/validators/is-data-iso.validator';

/** Em multipart os campos chegam como texto; campo vazio vale como não enviado. */
const vazioParaUndefined = () => Transform(({ value }) => (value === '' ? undefined : value));

/** A imagem chega pelo UploadImagemInterceptor; as regras de data rodam no service, no fuso da filial. */
export class CriarPanfletoDto {
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
