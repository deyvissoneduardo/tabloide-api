import { IsEmail, IsString, Length } from 'class-validator';
import { NormalizarEmail } from '../../../common/validators/transformacoes';

export class LoginDto {
  @NormalizarEmail()
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email!: string;

  // sem regra de força no login: só a do cadastro
  @IsString({ message: 'Informe a senha.' })
  @Length(1, 128, { message: 'Informe a senha.' })
  senha!: string;
}
