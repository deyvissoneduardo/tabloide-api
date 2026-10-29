import { ApiProperty } from '@nestjs/swagger';
import type { ConfiguracaoPaginaGuardada } from '../domain/configuracao-pagina';

const COR = { type: String, nullable: true, description: '#RRGGBB; null = padrão (RN48)' } as const;

export class CampanhaBannerView {
  /** FOTO (16:9) ou DESCRICAO, nunca as duas (RN46). */
  @ApiProperty({ enum: ['FOTO', 'DESCRICAO'] })
  tipo!: 'FOTO' | 'DESCRICAO';
  /** Só em FOTO. */
  @ApiProperty({ required: false, example: 'https://cdn.exemplo.com/t/banner/0192f0d0.webp' })
  urlFoto?: string;
  /** Só em DESCRICAO (até 280 caracteres). */
  @ApiProperty({ required: false })
  descricao?: string;
}

export class BannerPaginaView {
  exibir!: boolean;
  @ApiProperty({ type: String, nullable: true, example: 'Semana do Hortifrúti' })
  nome!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'https://cdn.exemplo.com/t/logo/0192f0d0.webp' })
  urlLogo!: string | null;
  @ApiProperty({ type: () => CampanhaBannerView, nullable: true })
  campanha!: CampanhaBannerView | null;
}

/** Valores crus: null = padrão; o painel resolve com a mesma tabela da API (RN48). */
export class CoresPaginaView {
  @ApiProperty({ ...COR, example: '#C8102E' }) primaria!: string | null;
  @ApiProperty(COR) secundaria!: string | null;
  @ApiProperty(COR) texto!: string | null;
  @ApiProperty(COR) textoSuave!: string | null;
  @ApiProperty(COR) fundoCartao!: string | null;
  @ApiProperty(COR) fundoPagina!: string | null;
  @ApiProperty(COR) neutra!: string | null;
  @ApiProperty(COR) sobreCor!: string | null;
  @ApiProperty({ ...COR, example: '#0B3D91' }) fundoBanner!: string | null;
  @ApiProperty(COR) categoria!: string | null;
}

/** Aparência da página pública (RN46–RN48), por lojista. Sem paths de storage nem tenant. */
export class ConfiguracaoPaginaView {
  banner!: BannerPaginaView;
  exibirNomeCategoria!: boolean;
  cores!: CoresPaginaView;
}

type UrlPublica = (caminho: string) => string;

export function configuracaoPaginaView(
  config: ConfiguracaoPaginaGuardada,
  url: UrlPublica,
): ConfiguracaoPaginaView {
  const { banner } = config;
  const campanha = banner.campanha;
  return {
    banner: {
      exibir: banner.exibir,
      nome: banner.nome,
      urlLogo: banner.logoPath === null ? null : url(banner.logoPath),
      campanha:
        campanha === null
          ? null
          : campanha.tipo === 'FOTO'
            ? { tipo: 'FOTO', urlFoto: url(campanha.fotoPath) }
            : { tipo: 'DESCRICAO', descricao: campanha.descricao },
    },
    exibirNomeCategoria: config.exibirNomeCategoria,
    cores: { ...config.cores },
  };
}
