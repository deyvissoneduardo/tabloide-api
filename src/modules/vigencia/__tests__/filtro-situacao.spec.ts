import { Op } from 'sequelize';
import type { DataISO } from '../../../common/utils/date-only';
import { condicaoExcluido, filtroSituacao } from '../consultas/filtro-situacao';

const HOJE = '2026-10-18' as DataISO;
const VIGENTE = {
  dataInicio: { [Op.lte]: HOJE },
  [Op.or]: [{ dataLimite: null }, { dataLimite: { [Op.gte]: HOJE } }],
};

describe('Funcionalidade: Traduzir situação em filtro SQL', () => {
  describe('Esquema do Cenário: situação única com hoje = 2026-10-18', () => {
    it.each([
      ['AGENDADO', { dataInicio: { [Op.gt]: HOJE } }, true],
      ['VIGENTE', VIGENTE, true],
      ['VENCIDO', { dataLimite: { [Op.lt]: HOJE } }, true],
      ['EXCLUIDO', { deletedAt: { [Op.ne]: null } }, false],
    ] as const)('Dado %s, o where e o paranoid correspondem', (situacao, where, paranoid) =>
      expect(filtroSituacao([situacao], HOJE)).toEqual({ where, paranoid }),
    );
  });

  describe('Cenário: padrão sem filtro', () => {
    it.each([undefined, []])('Então %p não acrescenta condição e mantém paranoid', (situacoes) =>
      expect(filtroSituacao(situacoes, HOJE)).toEqual({ where: {}, paranoid: true }),
    );
  });

  describe('Cenário: várias situações ativas', () => {
    it('Então Op.or das condições, mantendo paranoid', () =>
      expect(filtroSituacao(['AGENDADO', 'VIGENTE'], HOJE)).toEqual({
        where: { [Op.or]: [{ dataInicio: { [Op.gt]: HOJE } }, VIGENTE] },
        paranoid: true,
      }));
  });

  describe('Cenário: combinação com excluídos', () => {
    it('Então paranoid false e (VIGENTE AND deleted_at IS NULL) OR deleted_at IS NOT NULL', () =>
      expect(filtroSituacao(['VIGENTE', 'EXCLUIDO'], HOJE)).toEqual({
        where: { [Op.or]: [{ [Op.and]: [VIGENTE, { deletedAt: null }] }, condicaoExcluido()] },
        paranoid: false,
      }));
  });

  describe('Cenário: situações repetidas', () => {
    it('Então cada condição entra uma vez', () =>
      expect(filtroSituacao(['VENCIDO', 'VENCIDO'], HOJE)).toEqual({
        where: { dataLimite: { [Op.lt]: HOJE } },
        paranoid: true,
      }));
  });
});
