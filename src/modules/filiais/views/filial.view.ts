import { ApiProperty } from '@nestjs/swagger';
import type { Pagina } from '../../../common/dtos/paginacao-query.dto';
import type { EnderecoFilial } from '../domain/endereco';
import { urlPublicaDaFilial } from '../domain/url-publica';
import type { Filial } from '../models/filial.model';

export class EnderecoFilialView {
  @ApiProperty({ example: '01310100', description: 'Só os 8 dígitos' })
  cep!: string;
  logradouro!: string;
  numero!: string;
  // união com null: o plugin não resolve sozinho
  @ApiProperty({ type: String, nullable: true })
  complemento!: string | null;
  bairro!: string;
  cidade!: string;
  uf!: string;
}

/** Copia campo a campo: o model traz tenantId e timestamps, que não saem (RNF05). */
export function enderecoView(endereco: EnderecoFilial | null | undefined): EnderecoFilialView | null {
  if (!endereco) return null;
  return {
    cep: endereco.cep,
    logradouro: endereco.logradouro,
    numero: endereco.numero,
    complemento: endereco.complemento,
    bairro: endereco.bairro,
    cidade: endereco.cidade,
    uf: endereco.uf,
  };
}

export class FilialView {
  id!: string;
  nome!: string;
  /** null em filial anterior ao endereço estruturado. */
  @ApiProperty({ type: () => EnderecoFilialView, nullable: true })
  endereco!: EnderecoFilialView | null;
  fusoHorario!: string;
  codigoPublico!: string;
  urlPublica!: string;
  criadaEm!: string;
  atualizadaEm!: string;
}

/** Nunca expõe tenantId nem deletedAt. */
export function filialView(filial: Filial, baseUrlPublica: string): FilialView {
  return {
    id: filial.id,
    nome: filial.nome,
    endereco: enderecoView(filial.endereco),
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
