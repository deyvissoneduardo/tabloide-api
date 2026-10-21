import type { Lojista } from '../models/lojista.model';
import type { StatusLojista } from '../models/status-lojista';

export class LojistaView {
  id!: string;
  nomeFantasia!: string;
  nomeResponsavel!: string;
  email!: string;
  whatsapp!: string;
  cnpj!: string | null;
  status!: StatusLojista;
  criadoEm!: string;
}

/** Nunca expõe senhaHash. Logo e cores entram na Fase 3. */
export function lojistaView(lojista: Lojista, status: StatusLojista): LojistaView {
  return {
    id: lojista.id,
    nomeFantasia: lojista.nomeFantasia,
    nomeResponsavel: lojista.nomeResponsavel,
    email: lojista.email,
    whatsapp: lojista.whatsapp,
    cnpj: lojista.cnpj,
    status,
    criadoEm: lojista.createdAt.toISOString(),
  };
}
