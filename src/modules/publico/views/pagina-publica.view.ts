import { ApiProperty } from '@nestjs/swagger';
import { ApiDataISO } from '../../../common/swagger/data-iso.decorator';
import type { DataISO } from '../../../common/utils/date-only';
import { EnderecoFilialView, enderecoView } from '../../filiais/views/filial.view';
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
  /** null em filial anterior ao endereço estruturado. */
  @ApiProperty({ type: () => EnderecoFilialView, nullable: true })
  endereco!: EnderecoFilialView | null;
}

export class PanfletoPublicoJson {
  /** RN13: imagem (WebP) ou PDF de 1 página. */
  tipo!: 'IMAGEM' | 'PDF';
  arquivoUrl!: string;
  /** IMAGEM: px; PDF: pontos (1/72") da página 1, arredondados. */
  largura!: number;
  altura!: number;
  @ApiDataISO({ obrigatorio: false })
  validoAte?: DataISO;
}

export class CategoriaPublicaJson {
  nome!: string;
  produtos!: ProdutoPublicoJson[];
}

/** Categorias na ordem do lojista (RN30, RN45); vazia quando o panfleto é exibido (RN44). */
export class EstruturaPublicaJson {
  categorias!: CategoriaPublicaJson[];
}

export class PaginaPublicaJson {
  lojista!: LojistaPublicoJson;
  /** RN44: a escolha do lojista; a API já aplicou a regra em panfleto e estrutura. */
  sePanfleto!: boolean;
  filial!: FilialPublicaJson;
  /** Só quando sePanfleto e há panfleto vigente; senão null. */
  // união com null: o plugin não resolve sozinho
  @ApiProperty({ type: () => PanfletoPublicoJson, nullable: true })
  panfleto!: PanfletoPublicoJson | null;
  estrutura!: EstruturaPublicaJson;
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
export function paginaPublicaView(
  pagina: PaginaPublica,
  sePanfleto: boolean,
  url: UrlPublica,
  hoje: DataISO,
): PaginaPublicaJson {
  const { filial, panfleto } = pagina;
  return {
    lojista: {
      nome: filial.lojista.nomeFantasia,
      logoUrl: filial.lojista.logoPath === null ? null : url(filial.lojista.logoPath),
      corPrimaria: filial.lojista.corPrimaria,
      corSecundaria: filial.lojista.corSecundaria,
    },
    sePanfleto,
    filial: { nome: filial.nome, endereco: enderecoView(filial.endereco) },
    panfleto: panfleto && {
      tipo: panfleto.tipoArquivo,
      arquivoUrl: url(panfleto.imagemPath),
      largura: panfleto.imagemLargura,
      altura: panfleto.imagemAltura,
      ...seHouver('validoAte', panfleto.dataLimite),
    },
    estrutura: {
      categorias: pagina.categorias.map((c) => ({
        nome: c.nome,
        produtos: c.produtos.map((p) => produtoJson(p, url)),
      })),
    },
    hoje,
  };
}
