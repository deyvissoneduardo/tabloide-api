import type { DataISO } from '../../../common/utils/date-only';
import { validarEdicaoDeDatas } from '../domain/edicao';
import type { DatasInformadas } from '../domain/vigencia.types';

const d = (s: string) => s as DataISO;
const HOJE = d('2026-10-18');
const item = (inicio: string, limite: string | null, excluido = false) => ({
  dataInicio: d(inicio),
  dataLimite: limite === null ? null : d(limite),
  deletedAt: excluido ? new Date() : null,
});
const editar = (atual: ReturnType<typeof item>, novas: Record<string, string | null>) =>
  validarEdicaoDeDatas(atual, novas as DatasInformadas, HOJE);

describe('Funcionalidade: Edição de datas (RN26, RN42)', () => {
  describe('Contexto: hoje na filial é "2026-10-18"', () => {
    describe('Cenário: item vencido não é editável', () => {
      it('Então recebo ITEM_NAO_EDITAVEL', () =>
        expect(editar(item('2026-10-01', '2026-10-17'), { dataLimite: '2026-10-30' })).toMatchObject({
          ok: false,
          codigo: 'ITEM_NAO_EDITAVEL',
        }));
    });

    describe('Cenário: item excluído não é editável', () => {
      it('Então recebo ITEM_NAO_EDITAVEL', () =>
        expect(editar(item('2026-10-01', null, true), { dataLimite: '2026-10-30' })).toMatchObject({
          ok: false,
          codigo: 'ITEM_NAO_EDITAVEL',
        }));
    });

    describe('Cenário: vigente — alterar início é proibido', () => {
      it('Então recebo DATA_INICIO_IMUTAVEL', () =>
        expect(editar(item('2026-10-10', null), { dataInicio: '2026-10-20' })).toMatchObject({
          ok: false,
          codigo: 'DATA_INICIO_IMUTAVEL',
        }));
    });

    describe('Cenário: vigente — início null também é alteração proibida', () => {
      it('Então recebo DATA_INICIO_IMUTAVEL', () =>
        expect(editar(item('2026-10-10', null), { dataInicio: null })).toMatchObject({
          ok: false,
          codigo: 'DATA_INICIO_IMUTAVEL',
        }));
    });

    describe('Cenário: vigente — reenviar o mesmo início é aceito', () => {
      it('Então recebo o período com o novo limite', () =>
        expect(
          editar(item('2026-10-10', null), { dataInicio: '2026-10-10', dataLimite: '2026-10-25' }),
        ).toEqual({
          ok: true,
          valor: { inicio: '2026-10-10', limite: '2026-10-25' },
        }));
    });

    describe('Cenário: vigente — encurtar limite até hoje', () => {
      it('Então recebo ok com limite "2026-10-18"', () =>
        expect(editar(item('2026-10-10', '2026-10-30'), { dataLimite: '2026-10-18' })).toEqual({
          ok: true,
          valor: { inicio: '2026-10-10', limite: '2026-10-18' },
        }));
    });

    describe('Cenário: vigente — limite para ontem é recusado', () => {
      it('Então recebo DATA_LIMITE_INVALIDA', () =>
        expect(editar(item('2026-10-10', '2026-10-30'), { dataLimite: '2026-10-17' })).toMatchObject({
          ok: false,
          codigo: 'DATA_LIMITE_INVALIDA',
        }));
    });

    describe('Cenário: vigente — remover limite', () => {
      it('Então recebo ok com limite nulo', () =>
        expect(editar(item('2026-10-10', '2026-10-30'), { dataLimite: null })).toEqual({
          ok: true,
          valor: { inicio: '2026-10-10', limite: null },
        }));
    });

    describe('Cenário: vigente — sem campos de data enviados mantém o período', () => {
      it('Então recebo o período atual', () =>
        expect(editar(item('2026-10-10', '2026-10-30'), {})).toEqual({
          ok: true,
          valor: { inicio: '2026-10-10', limite: '2026-10-30' },
        }));
    });

    describe('Cenário: agendado — antecipar início para hoje', () => {
      it('Então recebo ok com início hoje', () =>
        expect(editar(item('2026-10-25', '2026-10-30'), { dataInicio: '2026-10-18' })).toEqual({
          ok: true,
          valor: { inicio: '2026-10-18', limite: '2026-10-30' },
        }));
    });

    describe('Cenário: agendado — início null publica agora (RN40)', () => {
      it('Então recebo ok com início hoje', () =>
        expect(editar(item('2026-10-25', null), { dataInicio: null })).toEqual({
          ok: true,
          valor: { inicio: '2026-10-18', limite: null },
        }));
    });

    describe('Cenário: agendado — início no passado é recusado', () => {
      it('Então recebo DATA_INICIO_INVALIDA', () =>
        expect(editar(item('2026-10-25', null), { dataInicio: '2026-10-17' })).toMatchObject({
          ok: false,
          codigo: 'DATA_INICIO_INVALIDA',
        }));
    });

    describe('Cenário: agendado — adiar início para depois do limite atual', () => {
      it('Então recebo DATA_LIMITE_INVALIDA', () =>
        expect(editar(item('2026-10-25', '2026-10-30'), { dataInicio: '2026-11-05' })).toMatchObject({
          ok: false,
          codigo: 'DATA_LIMITE_INVALIDA',
        }));
    });

    describe('Cenário: agendado — adiar início e limite juntos', () => {
      it('Então recebo o novo período', () =>
        expect(
          editar(item('2026-10-25', '2026-10-30'), { dataInicio: '2026-11-05', dataLimite: '2026-11-10' }),
        ).toEqual({
          ok: true,
          valor: { inicio: '2026-11-05', limite: '2026-11-10' },
        }));
    });

    describe('Cenário: item que começa hoje é vigente (não agendado)', () => {
      it('Então mudar o início dá DATA_INICIO_IMUTAVEL', () =>
        expect(editar(item('2026-10-18', null), { dataInicio: '2026-10-19' })).toMatchObject({
          ok: false,
          codigo: 'DATA_INICIO_IMUTAVEL',
        }));
    });
  });
});
