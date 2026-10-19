import type { DataISO } from '../../../common/utils/date-only';
import { calcularSituacao } from '../domain/situacao';

const d = (s: string) => s as DataISO;
const item = (inicio: string, limite: string | null, deletedAt: Date | null = null) => ({
  dataInicio: d(inicio),
  dataLimite: limite === null ? null : d(limite),
  deletedAt,
});

describe('Funcionalidade: Situação de item com vigência (RN23, RN24, RN25)', () => {
  describe.each`
    inicio          | limite          | situacao
    ${'2026-10-19'} | ${null}         | ${'AGENDADO'}
    ${'2026-10-19'} | ${'2026-10-25'} | ${'AGENDADO'}
    ${'2026-10-18'} | ${null}         | ${'VIGENTE'}
    ${'2026-10-18'} | ${'2026-10-18'} | ${'VIGENTE'}
    ${'2026-10-01'} | ${'2026-10-18'} | ${'VIGENTE'}
    ${'2026-10-01'} | ${null}         | ${'VIGENTE'}
    ${'2026-10-01'} | ${'2026-10-17'} | ${'VENCIDO'}
    ${'2025-12-31'} | ${'2026-01-01'} | ${'VENCIDO'}
  `('Cenário: item de $inicio a $limite', ({ inicio, limite, situacao }) => {
    describe('Quando calculo a situação para hoje "2026-10-18"', () => {
      it(`Então a situação é "${situacao}"`, () =>
        expect(calcularSituacao(item(inicio, limite), d('2026-10-18'))).toBe(situacao));
    });
  });

  describe('Cenário: item excluído prevalece sobre qualquer data', () => {
    it('Então vigente excluído é "EXCLUIDO"', () =>
      expect(calcularSituacao(item('2026-10-01', null, new Date()), d('2026-10-18'))).toBe('EXCLUIDO'));
    it('E agendado excluído é "EXCLUIDO"', () =>
      expect(calcularSituacao(item('2026-11-01', null, new Date()), d('2026-10-18'))).toBe('EXCLUIDO'));
  });

  describe('Cenário: virada de ano', () => {
    it('Então é VIGENTE em 2027-01-01 e VENCIDO em 2027-01-02', () => {
      const i = item('2026-12-31', '2027-01-01');
      expect(calcularSituacao(i, d('2027-01-01'))).toBe('VIGENTE');
      expect(calcularSituacao(i, d('2027-01-02'))).toBe('VENCIDO');
    });
  });

  describe('Cenário: ano bissexto', () => {
    it('Então é VIGENTE em 2028-02-29 e VENCIDO em 2028-03-01', () => {
      const i = item('2028-02-01', '2028-02-29');
      expect(calcularSituacao(i, d('2028-02-29'))).toBe('VIGENTE');
      expect(calcularSituacao(i, d('2028-03-01'))).toBe('VENCIDO');
    });
  });
});
