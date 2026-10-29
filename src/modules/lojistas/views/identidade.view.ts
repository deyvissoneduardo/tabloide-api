import type { CoresGuardadas } from '../domain/configuracao-pagina';
import type { Lojista } from '../models/lojista.model';

export class IdentidadeView {
  nomeFantasia!: string;
  /** Lida de configuracao_pagina.cores (RN48); null = padrão. */
  corPrimaria!: string | null;
  corSecundaria!: string | null;
  urlLogo!: string | null;
  /** RN44: a página pública mostra só o panfleto vigente, quando houver. */
  sePanfleto!: boolean;
}

/** O logo sempre cabe em 512 px; o front reserva um quadrado com object-fit: contain. */
export function identidadeView(
  lojista: Lojista,
  cores: Pick<CoresGuardadas, 'primaria' | 'secundaria'>,
  urlLogo: string | null,
): IdentidadeView {
  return {
    nomeFantasia: lojista.nomeFantasia,
    corPrimaria: cores.primaria,
    corSecundaria: cores.secundaria,
    urlLogo,
    sePanfleto: lojista.sePanfleto,
  };
}
