import type { DataISO } from '../../../common/utils/date-only';
import { encontrarConflito, type PeriodoPanfleto } from '../domain/conflito-periodo';

const p = (dataInicio: string, dataLimite: string | null, id?: string): PeriodoPanfleto => ({
  ...(id ? { id } : {}),
  dataInicio: dataInicio as DataISO,
  dataLimite: dataLimite as DataISO | null,
});
const tipo = (r: ReturnType<typeof encontrarConflito>) => r?.tipo ?? 'sem conflito';

describe('Funcionalidade: Detectar conflito entre períodos de panfleto (RN16, RN17)', () => {
  describe('Esquema do Cenário: novo panfleto contra E[10/11–20/11]', () => {
    const E = p('2026-11-10', '2026-11-20', 'e');
    it.each`
      caso                              | inicio          | limite          | resultado
      ${'inteiramente antes'}           | ${'2026-11-01'} | ${'2026-11-09'} | ${'sem conflito'}
      ${'inteiramente depois'}          | ${'2026-11-21'} | ${'2026-11-30'} | ${'sem conflito'}
      ${'termina quando E começa'}      | ${'2026-11-05'} | ${'2026-11-10'} | ${'SOBREPOSTO'}
      ${'começa quando E termina'}      | ${'2026-11-20'} | ${'2026-11-25'} | ${'SOBREPOSTO'}
      ${'dentro de E'}                  | ${'2026-11-12'} | ${'2026-11-15'} | ${'SOBREPOSTO'}
      ${'englobando E'}                 | ${'2026-11-05'} | ${'2026-11-25'} | ${'SOBREPOSTO'}
      ${'idêntico a E'}                 | ${'2026-11-10'} | ${'2026-11-20'} | ${'SOBREPOSTO'}
      ${'um dia só, dentro'}            | ${'2026-11-15'} | ${'2026-11-15'} | ${'SOBREPOSTO'}
      ${'sem limite, começando antes'}  | ${'2026-11-01'} | ${null}         | ${'SOBREPOSTO'}
      ${'sem limite, começando depois'} | ${'2026-11-21'} | ${null}         | ${'sem conflito'}
      ${'sem limite, começando em E'}   | ${'2026-11-20'} | ${null}         | ${'SOBREPOSTO'}
    `('Dado $caso, então $resultado', ({ inicio, limite, resultado }) =>
      expect(tipo(encontrarConflito(p(inicio, limite), [E]))).toBe(resultado),
    );
  });

  describe('Esquema do Cenário: existente sem data limite (RN17)', () => {
    it.each`
      caso                                   | iniS            | inicio          | limite          | resultado
      ${'atual sem limite, novo depois'}     | ${'2026-10-01'} | ${'2026-11-01'} | ${'2026-11-05'} | ${'SEM_DATA_LIMITE'}
      ${'ambos sem limite'}                  | ${'2026-10-01'} | ${'2026-11-01'} | ${null}         | ${'SEM_DATA_LIMITE'}
      ${'mesmo dia de início'}               | ${'2026-11-01'} | ${'2026-11-01'} | ${'2026-11-03'} | ${'SEM_DATA_LIMITE'}
      ${'S agendado, novo antes encostando'} | ${'2026-12-01'} | ${'2026-11-01'} | ${'2026-12-01'} | ${'SOBREPOSTO'}
      ${'S agendado, novo antes sem tocar'}  | ${'2026-12-01'} | ${'2026-11-01'} | ${'2026-11-30'} | ${'sem conflito'}
      ${'S agendado, novo antes sem limite'} | ${'2026-12-01'} | ${'2026-11-01'} | ${null}         | ${'SOBREPOSTO'}
    `('Dado $caso, então $resultado', ({ iniS, inicio, limite, resultado }) =>
      expect(tipo(encontrarConflito(p(inicio, limite), [p(iniS, null, 's')]))).toBe(resultado),
    );
  });

  describe('Cenário: vencido não conflita com novo período futuro', () => {
    it('Então não há conflito', () =>
      expect(
        encontrarConflito(p('2026-10-18', '2026-10-31'), [p('2026-10-01', '2026-10-10', 'v')]),
      ).toBeNull());
  });

  describe('Cenário: edição ignora o próprio panfleto', () => {
    it('Então não há conflito', () =>
      expect(
        encontrarConflito(p('2026-11-10', '2026-11-25'), [p('2026-11-10', '2026-11-20', 'p1')], 'p1'),
      ).toBeNull());
  });

  describe('Cenário: edição ainda conflita com outro', () => {
    it('Então SOBREPOSTO com E2', () => {
      const e2 = p('2026-11-21', '2026-11-30', 'p2');
      expect(
        encontrarConflito(p('2026-11-10', '2026-11-21'), [p('2026-11-10', '2026-11-20', 'p1'), e2], 'p1'),
      ).toEqual({
        tipo: 'SOBREPOSTO',
        com: e2,
      });
    });
  });

  describe('Cenário: SEM_DATA_LIMITE tem prioridade sobre SOBREPOSTO', () => {
    it('Então aponta o panfleto sem limite', () => {
      const s = p('2026-10-01', null, 's');
      expect(
        encontrarConflito(p('2026-11-12', '2026-11-15'), [p('2026-11-10', '2026-11-20', 'e'), s]),
      ).toEqual({
        tipo: 'SEM_DATA_LIMITE',
        com: s,
      });
    });
  });

  describe('Cenário: escolha determinística entre vários conflitos', () => {
    it('Então aponta o de menor início', () => {
      const e1 = p('2026-11-10', '2026-11-12', 'e1');
      const e2 = p('2026-11-14', '2026-11-16', 'e2');
      expect(encontrarConflito(p('2026-11-01', '2026-11-30'), [e2, e1])?.com).toBe(e1);
    });
  });

  describe('Cenário: nenhum existente', () => {
    it('Então não há conflito', () => expect(encontrarConflito(p('2026-11-01', null), [])).toBeNull());
  });
});
