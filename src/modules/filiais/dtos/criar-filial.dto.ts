import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { NormalizarEspacos } from '../../../common/validators/transformacoes';
import { EnderecoFilialDto } from './endereco-filial.dto';

export class CriarFilialDto {
  @NormalizarEspacos()
  @IsString({ message: 'nome é obrigatório e deve ter até 120 caracteres' })
  @Length(1, 120, { message: 'nome é obrigatório e deve ter até 120 caracteres' })
  nome!: string;

  @IsDefined({ message: 'endereço é obrigatório' })
  @IsObject({ message: 'endereço deve ser um objeto' })
  @ValidateNested()
  @Type(() => EnderecoFilialDto)
  endereco!: EnderecoFilialDto;

  /** Validado e normalizado no service (RN38); ausente usa o fuso padrão. */
  @IsOptional()
  @IsString({ message: 'fusoHorario deve ser texto' })
  @MaxLength(64, { message: 'fusoHorario deve ter até 64 caracteres' })
  fusoHorario?: string;

  /** RN44: true = a página pública desta filial mostra só o panfleto vigente. null é recusado. */
  @ValidateIf((o: CriarFilialDto) => o.sePanfleto !== undefined)
  @IsBoolean({ message: 'sePanfleto deve ser verdadeiro ou falso.' })
  sePanfleto?: boolean;
}
