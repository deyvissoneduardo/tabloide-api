import type { Lojista } from '../models/lojista.model';

export class IdentidadeView {
  nomeFantasia!: string;
  corPrimaria!: string | null;
  corSecundaria!: string | null;
  urlLogo!: string | null;
  /** RN44: a página pública mostra só o panfleto vigente, quando houver. */
  sePanfleto!: boolean;
}

/** O logo sempre cabe em 512 px; o front reserva um quadrado com object-fit: contain. */
export function identidadeView(lojista: Lojista, urlLogo: string | null): IdentidadeView {
  return {
    nomeFantasia: lojista.nomeFantasia,
    corPrimaria: lojista.corPrimaria ?? null,
    corSecundaria: lojista.corSecundaria ?? null,
    urlLogo,
    sePanfleto: lojista.sePanfleto,
  };
}
