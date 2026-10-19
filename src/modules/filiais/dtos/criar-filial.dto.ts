import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { NormalizarEspacos } from '../../../common/validators/transformacoes';

export class CriarFilialDto {
  @NormalizarEspacos()
  @IsString({ message: 'nome é obrigatório e deve ter até 120 caracteres' })
  @Length(1, 120, { message: 'nome é obrigatório e deve ter até 120 caracteres' })
  nome!: string;

  @NormalizarEspacos()
  @IsString({ message: 'endereço é obrigatório e deve ter até 300 caracteres' })
  @Length(1, 300, { message: 'endereço é obrigatório e deve ter até 300 caracteres' })
  endereco!: string;

  /** Validado e normalizado no service (RN38); ausente usa o fuso padrão. */
  @IsOptional()
  @IsString({ message: 'fusoHorario deve ser texto' })
  @MaxLength(64, { message: 'fusoHorario deve ter até 64 caracteres' })
  fusoHorario?: string;
}
