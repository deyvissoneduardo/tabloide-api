import { ApiHideProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';
import { NormalizarEspacos } from '../../../common/validators/transformacoes';
import { AoMenosUmCampo } from '../../../common/validators/validadores';

const COR_HEX = /^#[0-9A-F]{6}$/;
const MENSAGEM_COR = 'Informe a cor no formato #RRGGBB.';

/** Normaliza para maiúsculas, como exige o CHECK do banco; null segue como null (remove a cor). */
const CorMaiuscula = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value));

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
