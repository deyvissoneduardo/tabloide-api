import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { NormalizarEspacos } from '../../../common/validators/transformacoes';
import { AoMenosUmCampo } from '../../../common/validators/validadores';

/** codigoPublico não é editável (RN39): campo desconhecido é recusado pelo forbidNonWhitelisted. */
export class EditarFilialDto {
  @NormalizarEspacos()
  @IsOptional()
  @IsString({ message: 'nome deve ter até 120 caracteres' })
  @Length(1, 120, { message: 'nome não pode ficar vazio e deve ter até 120 caracteres' })
  nome?: string;

  @NormalizarEspacos()
  @IsOptional()
  @IsString({ message: 'endereço deve ter até 300 caracteres' })
  @Length(1, 300, { message: 'endereço não pode ficar vazio e deve ter até 300 caracteres' })
  endereco?: string;

  @IsOptional()
  @IsString({ message: 'fusoHorario deve ser texto' })
  @MaxLength(64, { message: 'fusoHorario deve ter até 64 caracteres' })
  fusoHorario?: string;

  @AoMenosUmCampo()
  readonly corpo?: never;
}
