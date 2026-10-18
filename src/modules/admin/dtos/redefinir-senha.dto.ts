import { IsString, Length, Matches } from 'class-validator';
import { MENSAGEM_SENHA_FORTE, REGEX_SENHA_FORTE } from '../../../common/validators/validadores';

export class RedefinirSenhaDto {
  @IsString({ message: MENSAGEM_SENHA_FORTE })
  @Length(8, 128, { message: MENSAGEM_SENHA_FORTE })
  @Matches(REGEX_SENHA_FORTE, { message: MENSAGEM_SENHA_FORTE })
  novaSenha!: string;
}
