import { ApiHideProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import {
  NormalizarCnpj,
  NormalizarEspacos,
  NormalizarWhatsapp,
} from '../../../common/validators/transformacoes';
import { AoMenosUmCampo, IsCnpj, IsWhatsappBr } from '../../../common/validators/validadores';

/** E-mail, senha, status e identidade visual não são editáveis aqui (forbidNonWhitelisted recusa). */
export class EditarLojistaDto {
  @NormalizarEspacos()
  @IsOptional()
  @IsString()
  @Length(2, 120, { message: 'O nome fantasia precisa ter de 2 a 120 caracteres.' })
  nomeFantasia?: string;

  @NormalizarEspacos()
  @IsOptional()
  @IsString()
  @Length(2, 120, { message: 'O nome do responsável precisa ter de 2 a 120 caracteres.' })
  nomeResponsavel?: string;

  @NormalizarWhatsapp()
  @IsOptional()
  @IsWhatsappBr()
  whatsapp?: string;

  /** null remove o CNPJ. */
  @NormalizarCnpj()
  @IsOptional()
  @IsCnpj()
  cnpj?: string | null;

  @AoMenosUmCampo()
  @ApiHideProperty()
  readonly corpo?: never;
}
