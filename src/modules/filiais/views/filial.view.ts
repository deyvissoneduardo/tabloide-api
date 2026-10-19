import type { Pagina } from '../../../common/dtos/paginacao-query.dto';
import { urlPublicaDaFilial } from '../domain/url-publica';
import type { Filial } from '../models/filial.model';

export interface FilialView {
  id: string;
  nome: string;
  endereco: string;
  fusoHorario: string;
  codigoPublico: string;
  urlPublica: string;
  criadaEm: string;
  atualizadaEm: string;
}

/** Nunca expõe tenantId nem deletedAt. */
export function filialView(filial: Filial, baseUrlPublica: string): FilialView {
  return {
    id: filial.id,
    nome: filial.nome,
    endereco: filial.endereco,
    fusoHorario: filial.fusoHorario,
    codigoPublico: filial.codigoPublico,
    urlPublica: urlPublicaDaFilial(baseUrlPublica, filial.codigoPublico),
    criadaEm: filial.createdAt.toISOString(),
    atualizadaEm: filial.updatedAt.toISOString(),
  };
}

export function listaDeFiliaisView(
  resultado: { itens: Filial[]; total: number },
  pagina: number,
  porPagina: number,
  baseUrlPublica: string,
): Pagina<FilialView> {
  return {
    itens: resultado.itens.map((f) => filialView(f, baseUrlPublica)),
    total: resultado.total,
    pagina,
    porPagina,
  };
}
