import type { DataISO } from '../../../common/utils/date-only';
import { INFINITO, periodosSeSobrepoem } from '../domain/periodos';

const p = (inicio: string, limite: string | null) => ({
  inicio: inicio as DataISO,
  limite: limite === null ? null : (limite as DataISO),
});

describe('Funcionalidade: Sobreposição de períodos fechados (base da RN16/RN17)', () => {
  describe.each`
    aIni            | aLim            | bIni            | bLim            | sobrepoe
    ${'2026-11-01'} | ${'2026-11-10'} | ${'2026-11-11'} | ${'2026-11-20'} | ${false}
    ${'2026-11-01'} | ${'2026-11-10'} | ${'2026-11-10'} | ${'2026-11-20'} | ${true}
    ${'2026-11-01'} | ${'2026-11-10'} | ${'2026-11-05'} | ${'2026-11-07'} | ${true}
    ${'2026-11-01'} | ${'2026-11-10'} | ${'2026-10-25'} | ${'2026-11-01'} | ${true}
    ${'2026-11-01'} | ${'2026-11-10'} | ${'2026-10-01'} | ${'2026-10-31'} | ${false}
    ${'2026-11-01'} | ${null}         | ${'2027-05-01'} | ${'2027-05-10'} | ${true}
    ${'2026-11-01'} | ${null}         | ${'2026-10-01'} | ${'2026-10-31'} | ${false}
    ${'2026-11-01'} | ${null}         | ${'2026-12-01'} | ${null}         | ${true}
    ${'2026-11-01'} | ${'2026-11-01'} | ${'2026-11-01'} | ${'2026-11-01'} | ${true}
    ${'2026-11-01'} | ${'2026-11-01'} | ${'2026-11-02'} | ${'2026-11-02'} | ${false}
  `('Cenário: A de $aIni a $aLim e B de $bIni a $bLim', ({ aIni, aLim, bIni, bLim, sobrepoe }) => {
    it(`Então o resultado é ${sobrepoe}`, () =>
      expect(periodosSeSobrepoem(p(aIni, aLim), p(bIni, bLim))).toBe(sobrepoe));
    it('E é o mesmo com A e B trocados', () =>
      expect(periodosSeSobrepoem(p(bIni, bLim), p(aIni, aLim))).toBe(sobrepoe));
  });

  describe('Cenário: constante de infinito', () => {
    it('Então INFINITO é "9999-12-31" e é maior que qualquer data usada', () => {
      expect(INFINITO).toBe('9999-12-31');
      expect(INFINITO > '2999-12-31').toBe(true);
    });
  });
});
