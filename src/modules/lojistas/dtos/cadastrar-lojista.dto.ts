import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import {
  NormalizarCnpj,
  NormalizarEmail,
  NormalizarEspacos,
  NormalizarWhatsapp,
} from '../../../common/validators/transformacoes';
import {
  IsCnpj,
  IsWhatsappBr,
  MENSAGEM_SENHA_FORTE,
  REGEX_SENHA_FORTE,
} from '../../../common/validators/validadores';

export class CadastrarLojistaDto {
  @NormalizarEspacos()
  @IsString({ message: 'Informe o nome fantasia.' })
  @Length(2, 120, { message: 'O nome fantasia precisa ter de 2 a 120 caracteres.' })
  nomeFantasia!: string;

  @NormalizarEspacos()
  @IsString({ message: 'Informe o nome do responsável.' })
  @Length(2, 120, { message: 'O nome do responsável precisa ter de 2 a 120 caracteres.' })
  nomeResponsavel!: string;

  @NormalizarEmail()
  @IsEmail({ allow_utf8_local_part: false }, { message: 'Informe um e-mail válido.' })
  @MaxLength(254, { message: 'O e-mail pode ter no máximo 254 caracteres.' })
  email!: string;

  // a senha nunca é aparada
  @IsString({ message: MENSAGEM_SENHA_FORTE })
  @Length(8, 128, { message: MENSAGEM_SENHA_FORTE })
  @Matches(REGEX_SENHA_FORTE, { message: MENSAGEM_SENHA_FORTE })
  senha!: string;

  @NormalizarWhatsapp()
  @IsWhatsappBr()
  whatsapp!: string;

  @NormalizarCnpj()
  @IsOptional()
  @IsCnpj()
  cnpj?: string | null;
}
