import { COR_HEX } from '../../../common/validators/validadores';

/**
 * Aparência da página pública por lojista (RN46, RN47, RN48), guardada em
 * lojistas.configuracao_pagina (jsonb). Chave ausente = padrão; tudo passa por normalizarConfiguracao.
 */

export const CHAVES_COR = [
  'primaria',
  'secundaria',
  'texto',
  'textoSuave',
  'fundoCartao',
  'fundoPagina',
  'neutra',
  'sobreCor',
  'fundoBanner',
  'categoria',
] as const;

export type ChaveCor = (typeof CHAVES_COR)[number];

/** null = padrão (CORES_PADRAO). */
export type CoresGuardadas = Record<ChaveCor, string | null>;
export type CoresResolvidas = Record<ChaveCor, string>;

/** RN48: o visual de hoje. fundoBanner e categoria seguem a primária já resolvida. */
export const CORES_PADRAO: Record<Exclude<ChaveCor, 'fundoBanner' | 'categoria'>, string> = {
  primaria: '#1565C0',
  secundaria: '#996B00',
  texto: '#1F1F1F',
  textoSuave: '#5C5C5C',
  fundoCartao: '#FFFFFF',
  fundoPagina: '#F3F4F6',
  neutra: '#EEEEEE',
  sobreCor: '#FFFFFF',
};

export const LIMITE_NOME_BANNER = 120;
export const LIMITE_DESCRICAO_BANNER = 280;

export type CampanhaGuardada = { tipo: 'FOTO'; fotoPath: string } | { tipo: 'DESCRICAO'; descricao: string };

export interface BannerGuardado {
  exibir: boolean;
  nome: string | null;
  logoPath: string | null;
  campanha: CampanhaGuardada | null;
}

export interface ConfiguracaoPaginaGuardada {
  banner: BannerGuardado;
  exibirNomeCategoria: boolean;
  cores: CoresGuardadas;
}

/** Edição já validada (DTO) ou vinda dos uploads. Ausente (undefined) = mantém. */
export interface EdicaoConfiguracaoPagina {
  banner?: {
    exibir?: boolean;
    nome?: string | null;
    /** Texto → campanha DESCRICAO; null → remove a campanha só se for DESCRICAO. */
    descricao?: string | null;
    logoPath?: string | null;
    /** Path → campanha FOTO; null → remove a campanha só se for FOTO. */
    fotoPath?: string | null;
  };
  exibirNomeCategoria?: boolean;
  cores?: Partial<CoresGuardadas>;
}

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const textoAte = (v: unknown, limite: number): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= limite ? v : null;

const cor = (v: unknown): string | null => (typeof v === 'string' && COR_HEX.test(v) ? v : null);

function normalizarCampanha(v: unknown): CampanhaGuardada | null {
  if (!ehObjeto(v)) return null;
  if (v.tipo === 'FOTO' && typeof v.fotoPath === 'string' && v.fotoPath.length > 0)
    return { tipo: 'FOTO', fotoPath: v.fotoPath };
  const descricao = textoAte(v.descricao, LIMITE_DESCRICAO_BANNER);
  if (v.tipo === 'DESCRICAO' && descricao !== null) return { tipo: 'DESCRICAO', descricao };
  return null;
}

/** Lê o jsonb como vier: preenche o que falta com o padrão e descarta o que está fora do formato. Nunca lança. */
export function normalizarConfiguracao(bruto: unknown): ConfiguracaoPaginaGuardada {
  const raiz = ehObjeto(bruto) ? bruto : {};
  const banner = ehObjeto(raiz.banner) ? raiz.banner : {};
  const cores = ehObjeto(raiz.cores) ? raiz.cores : {};
  return {
    banner: {
      exibir: banner.exibir === true,
      nome: textoAte(banner.nome, LIMITE_NOME_BANNER),
      logoPath: typeof banner.logoPath === 'string' && banner.logoPath.length > 0 ? banner.logoPath : null,
      campanha: normalizarCampanha(banner.campanha),
    },
    exibirNomeCategoria: raiz.exibirNomeCategoria !== false,
    cores: Object.fromEntries(CHAVES_COR.map((chave) => [chave, cor(cores[chave])])) as CoresGuardadas,
  };
}

/** RN48: valor escolhido ?? padrão, sem ajuste de contraste. */
export function resolverCores(cores: CoresGuardadas): CoresResolvidas {
  const primaria = cores.primaria ?? CORES_PADRAO.primaria;
  return {
    primaria,
    secundaria: cores.secundaria ?? CORES_PADRAO.secundaria,
    texto: cores.texto ?? CORES_PADRAO.texto,
    textoSuave: cores.textoSuave ?? CORES_PADRAO.textoSuave,
    fundoCartao: cores.fundoCartao ?? CORES_PADRAO.fundoCartao,
    fundoPagina: cores.fundoPagina ?? CORES_PADRAO.fundoPagina,
    neutra: cores.neutra ?? CORES_PADRAO.neutra,
    sobreCor: cores.sobreCor ?? CORES_PADRAO.sobreCor,
    fundoBanner: cores.fundoBanner ?? primaria,
    categoria: cores.categoria ?? primaria,
  };
}

function editarCampanha(
  atual: CampanhaGuardada | null,
  descricao: string | null | undefined,
  fotoPath: string | null | undefined,
): CampanhaGuardada | null {
  let campanha = atual;
  // a campanha é foto OU descrição: a nova substitui a outra (o arquivo da foto fica no storage)
  if (typeof descricao === 'string') campanha = { tipo: 'DESCRICAO', descricao };
  else if (descricao === null && campanha?.tipo === 'DESCRICAO') campanha = null;
  if (typeof fotoPath === 'string') campanha = { tipo: 'FOTO', fotoPath };
  else if (fotoPath === null && campanha?.tipo === 'FOTO') campanha = null;
  return campanha;
}

/** Regras do PATCH da aparência e dos uploads do banner. Não altera `atual`. */
export function aplicarEdicao(
  atual: ConfiguracaoPaginaGuardada,
  edicao: EdicaoConfiguracaoPagina,
): ConfiguracaoPaginaGuardada {
  const banner = edicao.banner ?? {};
  const cores = { ...atual.cores };
  for (const chave of CHAVES_COR) {
    const valor = edicao.cores?.[chave];
    if (valor !== undefined) cores[chave] = valor;
  }
  return {
    banner: {
      exibir: banner.exibir ?? atual.banner.exibir,
      nome: banner.nome === undefined ? atual.banner.nome : banner.nome,
      logoPath: banner.logoPath === undefined ? atual.banner.logoPath : banner.logoPath,
      campanha: editarCampanha(atual.banner.campanha, banner.descricao, banner.fotoPath),
    },
    exibirNomeCategoria: edicao.exibirNomeCategoria ?? atual.exibirNomeCategoria,
    cores,
  };
}
