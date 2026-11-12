import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import type { DataISO } from '../../../common/utils/date-only';
import {
  garantirPeriodoValido,
  intervaloDaFilial,
  lerPeriodo,
  validarPeriodo,
  type PeriodoPedido,
} from '../domain/periodo-relatorio';

const d = (s: string) => s as DataISO;
const HOJE = d('2026-11-09');
const personalizado = (inicio: string, fim: string): PeriodoPedido => ({
  tipo: 'PERSONALIZADO',
  inicio: d(inicio),
  fim: d(fim),
});

function motivoDe(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).codigo).toBe(CodigoErro.PERIODO_INVALIDO);
    expect((e as AppError).status).toBe(400);
    return (e as AppError).detalhes?.motivo;
  }
  throw new Error('não lançou');
}

describe('Funcionalidade: período do relatório de acessos (RN53, RN54)', () => {
  describe('Esquema do Cenário: combinações de parâmetros', () => {
    it.each([
      [{}, { tipo: 'PREDEFINIDO', dias: 30 }],
      [{ periodo: 1 }, { tipo: 'PREDEFINIDO', dias: 1 }],
      [{ periodo: 7 }, { tipo: 'PREDEFINIDO', dias: 7 }],
      [{ inicio: d('2026-10-01'), fim: d('2026-10-31') }, personalizado('2026-10-01', '2026-10-31')],
    ])('Dado %j, então %j', (q, esperado) => expect(lerPeriodo(q)).toEqual(esperado));

    it.each([
      [{ periodo: 7, inicio: d('2026-10-01') }],
      [{ periodo: 7, fim: d('2026-10-01') }],
      [{ periodo: 7, inicio: d('2026-10-01'), fim: d('2026-10-31') }],
      [{ inicio: d('2026-10-01') }],
      [{ fim: d('2026-10-31') }],
    ])('Dado %j, então PERIODO_INVALIDO/COMBINACAO', (q) =>
      expect(motivoDe(() => lerPeriodo(q))).toBe('COMBINACAO'),
    );
  });

  describe('Esquema do Cenário: validar o personalizado contra hoje', () => {
    it.each([
      ['2026-11-09', '2026-11-09', null],
      ['2025-11-09', '2026-11-09', null],
      ['2025-11-08', '2026-11-09', 'ACIMA_DE_366_DIAS'],
      ['2026-11-01', '2026-11-10', 'FIM_NO_FUTURO'],
      ['2026-11-05', '2026-11-04', 'FIM_ANTES_DO_INICIO'],
    ])('Dado %s → %s, então %s', (inicio, fim, motivo) =>
      expect(validarPeriodo(personalizado(inicio, fim), HOJE)).toBe(motivo),
    );

    it('Então o predefinido é sempre válido', () =>
      expect(validarPeriodo({ tipo: 'PREDEFINIDO', dias: 30 }, HOJE)).toBeNull());
  });

  describe('Cenário: garantir período válido', () => {
    it('Então lança com o motivo, ou não faz nada', () => {
      expect(motivoDe(() => garantirPeriodoValido(personalizado('2026-11-01', '2026-11-10'), HOJE))).toBe(
        'FIM_NO_FUTURO',
      );
      expect(() => garantirPeriodoValido(personalizado('2026-11-01', '2026-11-09'), HOJE)).not.toThrow();
    });
  });

  describe('Esquema do Cenário: intervalo da filial', () => {
    it.each([
      [1, '2026-11-09'],
      [7, '2026-11-03'],
      [15, '2026-10-26'],
      [30, '2026-10-11'],
    ] as const)('Dado %i dias, então começa em %s e termina hoje', (dias, inicio) =>
      expect(intervaloDaFilial({ tipo: 'PREDEFINIDO', dias }, HOJE)).toEqual({ inicio, fim: HOJE }),
    );

    it('Então o personalizado é o mesmo para qualquer filial', () =>
      expect(intervaloDaFilial(personalizado('2026-10-01', '2026-10-31'), d('2026-10-15'))).toEqual({
        inicio: '2026-10-01',
        fim: '2026-10-31',
      }));
  });
});
