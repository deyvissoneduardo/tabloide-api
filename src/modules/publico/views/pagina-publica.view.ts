import { ApiProperty } from '@nestjs/swagger';
import { ApiDataISO } from '../../../common/swagger/data-iso.decorator';
import type { DataISO } from '../../../common/utils/date-only';
import type { PaginaPublica, ProdutoRow } from '../domain/montar-pagina';

export class ProdutoPublicoJson {
  nome!: string;
  quantidade?: string;
  descricao?: string;
  observacao?: string;
  precoPromocionalCentavos!: number;
  precoOriginalCentavos?: number;
  fotoUrl?: string;
  @ApiDataISO({ obrigatorio: false })
  validoAte?: DataISO;
}

export class LojistaPublicoJson {
  nome!: string;
  logoUrl!: string | null;
  corPrimaria!: string | null;
  corSecundaria!: string | null;
}

export class FilialPublicaJson {
  nome!: string;
  endereco!: string;
}

export class PanfletoPublicoJson {
  imagemUrl!: string;
  largura!: number;
  altura!: number;
  @ApiDataISO({ obrigatorio: false })
  validoAte?: DataISO;
}

export class CategoriaPublicaJson {
  nome!: string;
  produtos!: ProdutoPublicoJson[];
}

export class PaginaPublicaJson {
  lojista!: LojistaPublicoJson;
  filial!: FilialPublicaJson;
  // união com null: o plugin não resolve sozinho
  @ApiProperty({ type: () => PanfletoPublicoJson, nullable: true })
  panfleto!: PanfletoPublicoJson | null;
  categorias!: CategoriaPublicaJson[];
  @ApiDataISO()
  hoje!: DataISO;
  geradoEm?: string;
}

type UrlPublica = (caminho: string) => string;

/** Inclui a chave só quando há valor: payload menor (RNF02) e nada de null a tratar no front. */
const seHouver = <K extends string, V>(chave: K, valor: V | null | undefined) =>
  (valor === null || valor === undefined ? {} : { [chave]: valor }) as Partial<Record<K, V>>;

function produtoJson(p: ProdutoRow, url: UrlPublica): ProdutoPublicoJson {
  return {
    nome: p.nome,
    ...seHouver('quantidade', p.quantidade),
    ...seHouver('descricao', p.descricao),
    ...seHouver('observacao', p.observacao),
    precoPromocionalCentavos: p.precoPromocionalCentavos,
    ...seHouver('precoOriginalCentavos', p.precoOriginalCentavos),
    ...seHouver('fotoUrl', p.fotoPath === null ? null : url(p.fotoPath)),
    ...seHouver('validoAte', p.dataLimite),
  };
}

/**
 * Só o que a página precisa (RNF05): nenhum id, tenant, fuso, status, path de storage nem
 * timestamp interno. geradoEm entra depois, fora do cálculo do ETag.
 */
export function paginaPublicaView(pagina: PaginaPublica, url: UrlPublica, hoje: DataISO): PaginaPublicaJson {
  const { filial, panfleto } = pagina;
  return {
    lojista: {
      nome: filial.lojista.nomeFantasia,
      logoUrl: filial.lojista.logoPath === null ? null : url(filial.lojista.logoPath),
      corPrimaria: filial.lojista.corPrimaria,
      corSecundaria: filial.lojista.corSecundaria,
    },
    filial: { nome: filial.nome, endereco: filial.endereco },
    panfleto: panfleto && {
      imagemUrl: url(panfleto.imagemPath),
      largura: panfleto.imagemLargura,
      altura: panfleto.imagemAltura,
      ...seHouver('validoAte', panfleto.dataLimite),
    },
    categorias: pagina.categorias.map((c) => ({
      nome: c.nome,
      produtos: c.produtos.map((p) => produtoJson(p, url)),
    })),
    hoje,
  };
}
