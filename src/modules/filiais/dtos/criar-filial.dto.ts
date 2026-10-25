import { Type } from 'class-transformer';
import {
  IsDefined,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
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
}
