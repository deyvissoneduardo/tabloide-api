import type { DataISO } from '../../../common/utils/date-only';
import { compararPorPosicao } from '../../../common/utils/ordem';
import type { EnderecoFilial } from '../../filiais/domain/endereco';
import {
  normalizarConfiguracao,
  resolverCores,
  type BannerGuardado,
  type CoresGuardadas,
  type CoresResolvidas,
} from '../../lojistas/domain/configuracao-pagina';
import type { StatusLojista } from '../../lojistas/models/status-lojista';
import type { TipoArquivoPanfleto } from '../../panfletos/domain/tipo-arquivo';

/** Consulta 1: filial pelo código, com identidade e status do lojista. */
export interface FilialPublicaRow {
  id: string;
  tenantId: string;
  nome: string;
  endereco: EnderecoFilial | null;
  fusoHorario: string;
  lojista: {
    nomeFantasia: string;
    logoPath: string | null;
    /** lojistas.configuracao_pagina como está no banco (RN46–RN48); normalizado aqui. */
    configuracaoPagina: unknown;
    /** RN44: mostrar só o panfleto vigente, quando houver. */
    sePanfleto: boolean;
    status: StatusLojista;
  };
}

export interface PanfletoRow {
  tipoArquivo: TipoArquivoPanfleto;
  imagemPath: string;
  imagemLargura: number;
  imagemAltura: number;
  dataLimite: DataISO | null;
}

export interface ProdutoRow {
  id: string;
  nome: string;
  quantidade: string | null;
  precoPromocionalCentavos: number;
  precoOriginalCentavos: number | null;
  descricao: string | null;
  observacao: string | null;
  fotoPath: string | null;
  dataLimite: DataISO | null;
  posicao: number | null;
  categoria: { id: string; nome: string; posicao: number | null };
}

export interface CategoriaDaPagina {
  id: string;
  nome: string;
  posicao: number | null;
  produtos: ProdutoRow[];
}

export interface AparenciaDaPagina {
  /** Valores crus (null = padrão), só para lojista.corPrimaria/corSecundaria da resposta (T4). */
  coresEscolhidas: CoresGuardadas;
  /** RN48: as 10 cores sempre resolvidas. */
  cores: CoresResolvidas;
  /** RN47 */
  exibirNomeCategoria: boolean;
  /** RN46: null com o banner desligado ou com o panfleto em exibição (U8). */
  banner: Omit<BannerGuardado, 'exibir'> | null;
}

export interface PaginaPublica {
  filial: FilialPublicaRow;
  panfleto: PanfletoRow | null;
  categorias: CategoriaDaPagina[];
  aparencia: AparenciaDaPagina;
}

/** A regra do banner fica só aqui: o React decide por aparencia.banner != null. */
export function montarAparencia(
  configuracaoPagina: unknown,
  panfleto: PanfletoRow | null,
): AparenciaDaPagina {
  const config = normalizarConfiguracao(configuracaoPagina);
  const { exibir, ...banner } = config.banner;
  return {
    coresEscolhidas: config.cores,
    cores: resolverCores(config.cores),
    exibirNomeCategoria: config.exibirNomeCategoria,
    banner: exibir && panfleto === null ? banner : null,
  };
}

/**
 * Agrupa por categoria em O(n), descarta grupos vazios (RN41) e ordena categorias e produtos
 * na ordem do lojista, com os não posicionados no fim em ordem alfabética pt-BR (RN30, RN45).
 * O desempate por id deixa a resposta e o ETag estáveis.
 */
export function montarPagina(entrada: {
  filial: FilialPublicaRow;
  panfleto: PanfletoRow | null;
  produtos: ProdutoRow[];
  /** Grupos extras sem produtos: na prática nunca existem, mas o descarte é explícito. */
  categoriasVazias?: Array<{ id: string; nome: string; posicao: number | null }>;
}): PaginaPublica {
  const grupos = new Map<string, CategoriaDaPagina>();
  for (const c of entrada.categoriasVazias ?? []) grupos.set(c.id, { ...c, produtos: [] });
  for (const produto of entrada.produtos) {
    const { id, nome, posicao } = produto.categoria;
    let grupo = grupos.get(id);
    if (!grupo) {
      grupo = { id, nome, posicao, produtos: [] };
      grupos.set(id, grupo);
    }
    grupo.produtos.push(produto);
  }

  const categorias = [...grupos.values()].filter((g) => g.produtos.length > 0).sort(compararPorPosicao);
  for (const grupo of categorias) grupo.produtos.sort(compararPorPosicao);
  return {
    filial: entrada.filial,
    panfleto: entrada.panfleto,
    categorias,
    aparencia: montarAparencia(entrada.filial.lojista.configuracaoPagina, entrada.panfleto),
  };
}
