/** Emitido após o commit por todo service que altera algo exibido na página pública (Fases 2 a 4). */
export const EVENTO_CONTEUDO_ALTERADO = 'filial.conteudo-alterado';

export interface ConteudoAlteradoEvento {
  tenantId: string;
  /** Ausente = afeta todas as filiais do tenant (ex.: identidade visual). */
  filialId?: string;
}
