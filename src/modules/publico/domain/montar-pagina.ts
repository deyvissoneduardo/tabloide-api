import type { DataISO } from '../../../common/utils/date-only';
import { compararTextoPtBr } from '../../../common/utils/text';
import type { StatusLojista } from '../../lojistas/models/status-lojista';

/** Consulta 1: filial pelo código, com identidade e status do lojista. */
export interface FilialPublicaRow {
  id: string;
  tenantId: string;
  nome: string;
  endereco: string;
  fusoHorario: string;
  lojista: {
    nomeFantasia: string;
    logoPath: string | null;
    corPrimaria: string | null;
    corSecundaria: string | null;
    status: StatusLojista;
  };
}

export interface PanfletoRow {
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
  categoria: { id: string; nome: string };
}

export interface CategoriaDaPagina {
  id: string;
  nome: string;
  produtos: ProdutoRow[];
}

export interface PaginaPublica {
  filial: FilialPublicaRow;
  panfleto: PanfletoRow | null;
  categorias: CategoriaDaPagina[];
}

const porNomeEId = (a: { nome: string; id: string }, b: { nome: string; id: string }) =>
  compararTextoPtBr(a.nome, b.nome) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Agrupa por categoria em O(n), descarta grupos vazios (RN41) e ordena categorias e produtos
 * em ordem alfabética pt-BR (RN30). O desempate por id deixa a resposta e o ETag estáveis.
 */
export function montarPagina(entrada: {
  filial: FilialPublicaRow;
  panfleto: PanfletoRow | null;
  produtos: ProdutoRow[];
  /** Grupos extras sem produtos: na prática nunca existem, mas o descarte é explícito. */
  categoriasVazias?: Array<{ id: string; nome: string }>;
}): PaginaPublica {
  const grupos = new Map<string, CategoriaDaPagina>();
  for (const c of entrada.categoriasVazias ?? []) grupos.set(c.id, { ...c, produtos: [] });
  for (const produto of entrada.produtos) {
    const { id, nome } = produto.categoria;
    let grupo = grupos.get(id);
    if (!grupo) {
      grupo = { id, nome, produtos: [] };
      grupos.set(id, grupo);
    }
    grupo.produtos.push(produto);
  }

  const categorias = [...grupos.values()].filter((g) => g.produtos.length > 0).sort(porNomeEId);
  for (const grupo of categorias) grupo.produtos.sort(porNomeEId);
  return { filial: entrada.filial, panfleto: entrada.panfleto, categorias };
}
