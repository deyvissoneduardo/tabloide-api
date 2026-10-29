import { applyDecorators } from '@nestjs/common';
import { ApiHideProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsObject, IsString, Length, Matches, ValidateIf, ValidateNested } from 'class-validator';
import { CorMaiuscula, NormalizarEspacos } from '../../../common/validators/transformacoes';
import { AoMenosUmCampo, COR_HEX, MENSAGEM_COR } from '../../../common/validators/validadores';
import { LIMITE_DESCRICAO_BANNER, LIMITE_NOME_BANNER } from '../domain/configuracao-pagina';

const preenchido = (_o: object, valor: unknown) => valor !== null && valor !== undefined;

/** #RRGGBB (vira maiúscula) ou null (= padrão, RN48). Ausente = mantém. */
const CorOpcional = () =>
  applyDecorators(
    ApiPropertyOptional({ type: String, nullable: true, example: '#C8102E' }),
    CorMaiuscula(),
    ValidateIf(preenchido),
    Matches(COR_HEX, { message: MENSAGEM_COR }),
  );

/** Objeto aninhado opcional: null é recusado (ausente = mantém). */
const Aninhado = (classe: () => new () => object, mensagem: string) =>
  applyDecorators(
    ValidateIf((_o: object, valor: unknown) => valor !== undefined),
    IsObject({ message: mensagem }),
    ValidateNested(),
    Type(classe),
  );

export class EditarBannerDto {
  /** RN46: liga/desliga o banner. null é recusado. */
  @ValidateIf((_o: object, valor: unknown) => valor !== undefined)
  @IsBoolean({ message: 'exibir deve ser verdadeiro ou falso.' })
  exibir?: boolean;

  /** Nome próprio do banner; null remove. */
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITE_NOME_BANNER })
  @NormalizarEspacos()
  @ValidateIf(preenchido)
  @IsString({ message: `O nome do banner precisa ter de 1 a ${LIMITE_NOME_BANNER} caracteres.` })
  @Length(1, LIMITE_NOME_BANNER, {
    message: `O nome do banner precisa ter de 1 a ${LIMITE_NOME_BANNER} caracteres.`,
  })
  nome?: string | null;

  /** Texto → campanha DESCRICAO (substitui a foto); null remove a descrição (a foto fica). */
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: LIMITE_DESCRICAO_BANNER })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf(preenchido)
  @IsString({ message: `A descrição precisa ter de 1 a ${LIMITE_DESCRICAO_BANNER} caracteres.` })
  @Length(1, LIMITE_DESCRICAO_BANNER, {
    message: `A descrição precisa ter de 1 a ${LIMITE_DESCRICAO_BANNER} caracteres.`,
  })
  descricao?: string | null;
}

/** RN48: qualquer subconjunto das 10 cores. */
export class EditarCoresDto {
  @CorOpcional() primaria?: string | null;
  @CorOpcional() secundaria?: string | null;
  @CorOpcional() texto?: string | null;
  @CorOpcional() textoSuave?: string | null;
  @CorOpcional() fundoCartao?: string | null;
  @CorOpcional() fundoPagina?: string | null;
  @CorOpcional() neutra?: string | null;
  @CorOpcional() sobreCor?: string | null;
  @CorOpcional() fundoBanner?: string | null;
  @CorOpcional() categoria?: string | null;
}

/** Todos opcionais, ao menos um; ausente = mantém. */
export class EditarConfiguracaoPaginaDto {
  @Aninhado(() => EditarBannerDto, 'banner deve ser um objeto.')
  banner?: EditarBannerDto;

  /** RN47: false = grade única, sem o nome das categorias. null é recusado. */
  @ValidateIf((_o: object, valor: unknown) => valor !== undefined)
  @IsBoolean({ message: 'exibirNomeCategoria deve ser verdadeiro ou falso.' })
  exibirNomeCategoria?: boolean;

  @Aninhado(() => EditarCoresDto, 'cores deve ser um objeto.')
  cores?: EditarCoresDto;

  @AoMenosUmCampo()
  @ApiHideProperty()
  readonly corpo?: never;
}
