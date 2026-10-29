import { ApiHideProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';
import { CorMaiuscula, NormalizarEspacos } from '../../../common/validators/transformacoes';
import { AoMenosUmCampo, COR_HEX, MENSAGEM_COR } from '../../../common/validators/validadores';

export class EditarIdentidadeDto {
  @NormalizarEspacos()
  @IsOptional()
  @IsString()
  @Length(2, 120, { message: 'O nome fantasia precisa ter de 2 a 120 caracteres.' })
  nomeFantasia?: string;

  @CorMaiuscula()
  @ValidateIf((o: EditarIdentidadeDto) => o.corPrimaria !== null && o.corPrimaria !== undefined)
  @Matches(COR_HEX, { message: MENSAGEM_COR })
  corPrimaria?: string | null;

  @CorMaiuscula()
  @ValidateIf((o: EditarIdentidadeDto) => o.corSecundaria !== null && o.corSecundaria !== undefined)
  @Matches(COR_HEX, { message: MENSAGEM_COR })
  corSecundaria?: string | null;

  /** RN44: true = a página pública mostra só o panfleto vigente. null é recusado (sem IsOptional de propósito). */
  @ValidateIf((o: EditarIdentidadeDto) => o.sePanfleto !== undefined)
  @IsBoolean({ message: 'sePanfleto deve ser verdadeiro ou falso.' })
  sePanfleto?: boolean;

  @AoMenosUmCampo()
  @ApiHideProperty()
  readonly corpo?: never;
}
