import type { AuditoriaAlteracao, EntidadeAuditada } from '../models/auditoria-alteracao.model';

export interface AuditoriaAlteracaoView {
  id: string;
  entidade: EntidadeAuditada;
  entidadeId: string;
  campo: string;
  valorAnterior: string | null;
  valorNovo: string | null;
  alteradoEm: string;
  requestId: string | null;
}

export function auditoriaAlteracaoView(a: AuditoriaAlteracao): AuditoriaAlteracaoView {
  return {
    id: a.id,
    entidade: a.entidade,
    entidadeId: a.entidadeId,
    campo: a.campo,
    valorAnterior: a.valorAnterior,
    valorNovo: a.valorNovo,
    alteradoEm: a.alteradoEm.toISOString(),
    requestId: a.requestId,
  };
}
