import type { DataISO } from '../../../common/utils/date-only';
import { resolverDataInicio, validarCriacao, validarDatas } from '../domain/datas';

const d = (s: string) => s as DataISO;
const HOJE = d('2026-10-18');

describe('Funcionalidade: Datas na criação (RN15, RN40, RN42)', () => {
  describe('Contexto: hoje na filial é "2026-10-18"', () => {
    describe('Cenário: sem data de início vale a partir de hoje (RN40)', () => {
      it('Então ausente vira hoje', () =>
        expect(resolverDataInicio(undefined, HOJE)).toEqual({ ok: true, valor: HOJE }));
      it('E null também vira hoje', () =>
        expect(resolverDataInicio(null, HOJE)).toEqual({ ok: true, valor: HOJE }));
    });

    describe('Cenário: início hoje ou futuro é aceito', () => {
      it.each(['2026-10-18', '2026-11-01'])('Então "%s" é aceito', (v) =>
        expect(resolverDataInicio(d(v), HOJE)).toEqual({ ok: true, valor: v }),
      );
    });

    describe('Cenário: início no passado é recusado (D5)', () => {
      it('Então recebo DATA_INICIO_INVALIDA em dataInicio', () =>
        expect(resolverDataInicio(d('2026-10-17'), HOJE)).toEqual({
          ok: false,
          codigo: 'DATA_INICIO_INVALIDA',
          campo: 'dataInicio',
        }));
    });

    describe('Cenário: sem data limite é válido (RN15)', () => {
      it('Então recebo ok com limite nulo', () =>
        expect(validarDatas(HOJE, null, HOJE)).toEqual({ ok: true, valor: { inicio: HOJE, limite: null } }));
    });

    describe('Cenário: limite igual ao início vale um dia', () => {
      it('Então recebo ok', () =>
        expect(validarDatas(d('2026-10-20'), d('2026-10-20'), HOJE)).toEqual({
          ok: true,
          valor: { inicio: '2026-10-20', limite: '2026-10-20' },
        }));
    });

    describe('Cenário: limite hoje é válido', () => {
      it('Então recebo ok', () => expect(validarDatas(HOJE, HOJE, HOJE).ok).toBe(true));
    });

    describe('Cenário: limite anterior ao início é recusado (RN42)', () => {
      it('Então recebo DATA_LIMITE_INVALIDA em dataLimite', () =>
        expect(validarDatas(d('2026-10-20'), d('2026-10-19'), HOJE)).toEqual({
          ok: false,
          codigo: 'DATA_LIMITE_INVALIDA',
          campo: 'dataLimite',
        }));
    });

    describe('Cenário: limite anterior a hoje é recusado (RN42)', () => {
      it('Então recebo DATA_LIMITE_INVALIDA mesmo com início anterior', () =>
        expect(validarDatas(d('2026-10-10'), d('2026-10-17'), HOJE)).toMatchObject({
          ok: false,
          codigo: 'DATA_LIMITE_INVALIDA',
        }));
    });

    describe('Cenário: validarCriacao compõe início ausente com limite futuro', () => {
      it('Então recebo { inicio: hoje, limite: "2026-10-31" }', () =>
        expect(validarCriacao({ dataLimite: d('2026-10-31') }, HOJE)).toEqual({
          ok: true,
          valor: { inicio: HOJE, limite: '2026-10-31' },
        }));
    });

    describe('Cenário: validarCriacao sem nenhuma data', () => {
      it('Então vale de hoje sem limite', () =>
        expect(validarCriacao({}, HOJE)).toEqual({ ok: true, valor: { inicio: HOJE, limite: null } }));
    });

    describe('Cenário: validarCriacao interrompe no erro de início', () => {
      it('Então recebo DATA_INICIO_INVALIDA (o primeiro erro encontrado)', () =>
        expect(
          validarCriacao({ dataInicio: d('2026-10-01'), dataLimite: d('2026-09-01') }, HOJE),
        ).toMatchObject({
          ok: false,
          codigo: 'DATA_INICIO_INVALIDA',
        }));
    });
  });
});
