import { IsString, Length } from 'class-validator';
import { NormalizarEspacos } from '../../../common/validators/transformacoes';

export class CriarCategoriaDto {
  @NormalizarEspacos()
  @IsString({ message: 'Informe o nome da categoria.' })
  @Length(1, 80, { message: 'O nome da categoria deve ter de 1 a 80 caracteres.' })
  nome!: string;
}
