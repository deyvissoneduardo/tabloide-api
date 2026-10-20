import type { DataISO } from '../../../common/utils/date-only';
import type { PaginaPublica, ProdutoRow } from '../domain/montar-pagina';

export interface ProdutoPublicoJson {
  nome: string;
  quantidade?: string;
  descricao?: string;
  observacao?: string;
  precoPromocionalCentavos: number;
  precoOriginalCentavos?: number;
  fotoUrl?: string;
  validoAte?: DataISO;
}

export interface PaginaPublicaJson {
  lojista: { nome: string; logoUrl: string | null; corPrimaria: string | null; corSecundaria: string | null };
  filial: { nome: string; endereco: string };
  panfleto: { imagemUrl: string; largura: number; altura: number; validoAte?: DataISO } | null;
  categorias: Array<{ nome: string; produtos: ProdutoPublicoJson[] }>;
  hoje: DataISO;
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
