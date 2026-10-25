import { ApiHideProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { NormalizarEspacos } from '../../../common/validators/transformacoes';
import { AoMenosUmCampo } from '../../../common/validators/validadores';
import { EnderecoFilialDto } from './endereco-filial.dto';

/** codigoPublico não é editável (RN39): campo desconhecido é recusado pelo forbidNonWhitelisted. */
export class EditarFilialDto {
  @NormalizarEspacos()
  @IsOptional()
  @IsString({ message: 'nome deve ter até 120 caracteres' })
  @Length(1, 120, { message: 'nome não pode ficar vazio e deve ter até 120 caracteres' })
  nome?: string;

  /** Vem inteiro e substitui o endereço atual; null é recusado (não há como remover o endereço). */
  @ValidateIf((o: EditarFilialDto) => o.endereco !== undefined)
  @IsObject({ message: 'endereço deve ser um objeto' })
  @ValidateNested()
  @Type(() => EnderecoFilialDto)
  endereco?: EnderecoFilialDto;

  @IsOptional()
  @IsString({ message: 'fusoHorario deve ser texto' })
  @MaxLength(64, { message: 'fusoHorario deve ter até 64 caracteres' })
  fusoHorario?: string;

  @AoMenosUmCampo()
  @ApiHideProperty()
  readonly corpo?: never;
}
