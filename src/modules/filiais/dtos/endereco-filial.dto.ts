import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { NormalizarEspacos, TextoOpcional } from '../../../common/validators/transformacoes';

/** Aceita "00000-000" ou "00000000"; grava só os dígitos. */
const NormalizarCep = () =>
  Transform(({ value }) =>
    typeof value === 'string' && /^\d{5}-\d{3}$/.test(value.trim()) ? value.trim().replace('-', '') : value,
  );

/** Endereço completo: no PATCH também vem inteiro e substitui o anterior. A UF é validada no front. */
export class EnderecoFilialDto {
  @NormalizarCep()
  @IsString({ message: 'cep é obrigatório no formato 00000-000' })
  @Matches(/^\d{8}$/, { message: 'cep é obrigatório no formato 00000-000' })
  cep!: string;

  @NormalizarEspacos()
  @IsString({ message: 'logradouro é obrigatório e deve ter até 200 caracteres' })
  @Length(1, 200, { message: 'logradouro é obrigatório e deve ter até 200 caracteres' })
  logradouro!: string;

  @NormalizarEspacos()
  @IsString({ message: 'número é obrigatório e deve ter até 20 caracteres' })
  @Length(1, 20, { message: 'número é obrigatório e deve ter até 20 caracteres' })
  numero!: string;

  @TextoOpcional()
  @IsOptional()
  @IsString({ message: 'complemento deve ter até 100 caracteres' })
  @Length(1, 100, { message: 'complemento deve ter até 100 caracteres' })
  complemento?: string;

  @NormalizarEspacos()
  @IsString({ message: 'bairro é obrigatório e deve ter até 100 caracteres' })
  @Length(1, 100, { message: 'bairro é obrigatório e deve ter até 100 caracteres' })
  bairro!: string;

  @NormalizarEspacos()
  @IsString({ message: 'cidade é obrigatória e deve ter até 100 caracteres' })
  @Length(1, 100, { message: 'cidade é obrigatória e deve ter até 100 caracteres' })
  cidade!: string;

  @NormalizarEspacos()
  @IsString({ message: 'uf é obrigatória e deve ter 2 caracteres' })
  @Length(2, 2, { message: 'uf é obrigatória e deve ter 2 caracteres' })
  uf!: string;
}
