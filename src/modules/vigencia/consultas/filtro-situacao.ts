import { Op, type WhereOptions } from 'sequelize';
import type { DataISO, Situacao } from '../domain/vigencia.types';

/**
 * Traduz situações em condições SQL sobre data_inicio/data_limite/deleted_at, para filtrar
 * no banco em vez de em memória. Fica fora de domain/ porque depende do Sequelize.
 * Mesma semântica de calcularSituacao. Usado por panfletos (Fase 3) e produtos (Fase 4).
 */
export const condicaoAgendado = (hoje: DataISO): WhereOptions => ({ dataInicio: { [Op.gt]: hoje } });

export const condicaoVigente = (hoje: DataISO): WhereOptions => ({
  dataInicio: { [Op.lte]: hoje },
  [Op.or]: [{ dataLimite: null }, { dataLimite: { [Op.gte]: hoje } }],
});

export const condicaoVencido = (hoje: DataISO): WhereOptions => ({ dataLimite: { [Op.lt]: hoje } });

export const condicaoExcluido = (): WhereOptions => ({ deletedAt: { [Op.ne]: null } });

export interface FiltroSituacao {
  where: WhereOptions;
  /** false quando os excluídos entram no resultado. */
  paranoid: boolean;
}

const CONDICOES: Record<Exclude<Situacao, 'EXCLUIDO'>, (hoje: DataISO) => WhereOptions> = {
  AGENDADO: condicaoAgendado,
  VIGENTE: condicaoVigente,
  VENCIDO: condicaoVencido,
};

/** Sem situações: todos os não excluídos. */
export function filtroSituacao(situacoes: readonly Situacao[] | undefined, hoje: DataISO): FiltroSituacao {
  if (!situacoes || situacoes.length === 0) return { where: {}, paranoid: true };

  const comExcluidos = situacoes.includes('EXCLUIDO');
  const ativas = [...new Set(situacoes)].filter((s): s is Exclude<Situacao, 'EXCLUIDO'> => s !== 'EXCLUIDO');
  // com paranoid desligado, as situações ativas precisam excluir as linhas apagadas explicitamente
  const condicoes: WhereOptions[] = ativas.map((s) =>
    comExcluidos ? { [Op.and]: [CONDICOES[s](hoje), { deletedAt: null }] } : CONDICOES[s](hoje),
  );
  if (comExcluidos) condicoes.push(condicaoExcluido());

  return {
    where: condicoes.length === 1 ? condicoes[0]! : { [Op.or]: condicoes },
    paranoid: !comExcluidos,
  };
}
