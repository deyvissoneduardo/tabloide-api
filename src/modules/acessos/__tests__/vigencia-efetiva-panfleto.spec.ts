import type { DataISO } from '../../../common/utils/date-only';
import { cruzaIntervalo, vigenciaEfetiva } from '../domain/vigencia-efetiva-panfleto';

const d = (s: string) => s as DataISO;
const HOJE = d('2026-11-09');
const p = (dataInicio: string, dataLimite: string | null, dataExclusao: string | null = null) => ({
  dataInicio: d(dataInicio),
  dataLimite: dataLimite === null ? null : d(dataLimite),
  dataExclusao: dataExclusao === null ? null : d(dataExclusao),
});

describe('Funcionalidade: vigência efetiva do panfleto (RN55)', () => {
  describe('Esquema do Cenário: fim efetivo e situação', () => {
    it.each([
      [
        'sem data limite e vigente',
        p('2026-10-20', null),
        { inicio: '2026-10-20', fim: '2026-11-09', situacao: 'VIGENTE' },
      ],
      [
        'limite depois de hoje',
        p('2026-10-20', '2026-11-15'),
        { inicio: '2026-10-20', fim: '2026-11-09', situacao: 'VIGENTE' },
      ],
      [
        'limite hoje',
        p('2026-10-20', '2026-11-09'),
        { inicio: '2026-10-20', fim: '2026-11-09', situacao: 'VIGENTE' },
      ],
      [
        'vencido',
        p('2026-10-01', '2026-10-10'),
        { inicio: '2026-10-01', fim: '2026-10-10', situacao: 'VENCIDO' },
      ],
      [
        'excluído no meio',
        p('2026-10-01', '2026-10-31', '2026-10-15'),
        { inicio: '2026-10-01', fim: '2026-10-15', situacao: 'EXCLUIDO' },
      ],
      [
        'excluído depois de vencer',
        p('2026-10-01', '2026-10-10', '2026-10-20'),
        { inicio: '2026-10-01', fim: '2026-10-10', situacao: 'EXCLUIDO' },
      ],
      [
        'panfleto de 1 dia',
        p('2026-11-01', '2026-11-01'),
        { inicio: '2026-11-01', fim: '2026-11-01', situacao: 'VENCIDO' },
      ],
      [
        'excluído no dia do início',
        p('2026-11-01', null, '2026-11-01'),
        { inicio: '2026-11-01', fim: '2026-11-01', situacao: 'EXCLUIDO' },
      ],
    ])('Dado %s, então %j', (_nome, panfleto, esperado) =>
      expect(vigenciaEfetiva(panfleto, HOJE)).toEqual(esperado),
    );

    it.each([
      ['agendado no futuro', p('2026-11-10', null)],
      ['excluído antes de começar', p('2026-11-05', null, '2026-11-03')],
    ])('Dado %s, então fica fora (null)', (_nome, panfleto) =>
      expect(vigenciaEfetiva(panfleto, HOJE)).toBeNull(),
    );
  });

  describe('Esquema do Cenário: cruza o intervalo do filtro', () => {
    const filtro = { inicio: d('2026-11-01'), fim: d('2026-11-09') };
    it.each([
      ['2026-10-01', '2026-10-31', false],
      ['2026-10-01', '2026-11-01', true],
      ['2026-11-09', '2026-11-09', true],
      ['2026-10-20', '2026-11-20', true],
    ])('Dado %s → %s, então %s', (inicio, fim, esperado) =>
      expect(cruzaIntervalo({ inicio: d(inicio), fim: d(fim) }, filtro)).toBe(esperado),
    );
  });
});
