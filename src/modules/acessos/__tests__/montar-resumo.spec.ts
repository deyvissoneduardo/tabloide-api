import type { DataISO } from '../../../common/utils/date-only';
import { montarResumo, type EntradaResumo } from '../domain/montar-resumo';

const d = (s: string) => s as DataISO;

const entrada = (parcial: Partial<EntradaResumo> = {}): EntradaResumo => ({
  intervalo: { inicio: d('2026-11-01'), fim: d('2026-11-05') },
  filiais: [],
  totaisPorFilial: new Map(),
  porData: [],
  porHora: [],
  porDiaSemana: [],
  iniciosPanfleto: [],
  ...parcial,
});

describe('Funcionalidade: montar o resumo de acessos (RN54, RN57)', () => {
  describe('Cenário: dias sem acesso no meio do período', () => {
    it('Então porDia é contínuo, com 0 nos buracos, e total é a soma', () => {
      const r = montarResumo(
        entrada({
          porData: [
            { data: d('2026-11-01'), total: 3 },
            { data: d('2026-11-04'), total: 5 },
          ],
        }),
      );
      expect(r.porDia).toEqual([
        { data: '2026-11-01', total: 3 },
        { data: '2026-11-02', total: 0 },
        { data: '2026-11-03', total: 0 },
        { data: '2026-11-04', total: 5 },
        { data: '2026-11-05', total: 0 },
      ]);
      expect(r.total).toBe(8);
    });
  });

  describe('Cenário: ranking de filiais', () => {
    it('Então ordena por total desc, empate por nome, e esconde a excluída sem acesso', () => {
      const r = montarResumo(
        entrada({
          filiais: [
            { id: 'a', nome: 'Centro', excluida: false },
            { id: 'b', nome: 'Bairro Novo', excluida: false },
            { id: 'c', nome: 'Água Branca', excluida: false },
            { id: 'x', nome: 'Antiga sem acesso', excluida: true },
            { id: 'y', nome: 'Antiga com acesso', excluida: true },
          ],
          totaisPorFilial: new Map([
            ['a', 10],
            ['b', 10],
            ['y', 2],
          ]),
        }),
      );
      expect(r.porFilial).toEqual([
        { filialId: 'b', nome: 'Bairro Novo', excluida: false, total: 10 },
        { filialId: 'a', nome: 'Centro', excluida: false, total: 10 },
        { filialId: 'y', nome: 'Antiga com acesso', excluida: true, total: 2 },
        { filialId: 'c', nome: 'Água Branca', excluida: false, total: 0 },
      ]);
    });
  });

  describe('Esquema do Cenário: horário de pico só com volume mínimo', () => {
    it('Dado 99 acessos, então indisponível e vetores null', () => {
      const r = montarResumo(entrada({ porData: [{ data: d('2026-11-01'), total: 99 }] }));
      expect(r.pico).toEqual({ disponivel: false, minimo: 100, porHora: null, porDiaSemana: null });
    });

    it('Dado 100 acessos, então 24 horas e 7 dias, com ISODOW 1 (segunda) no índice 0', () => {
      const r = montarResumo(
        entrada({
          porData: [{ data: d('2026-11-01'), total: 100 }],
          porHora: [
            { hora: 0, total: 1 },
            { hora: 23, total: 99 },
          ],
          porDiaSemana: [
            { diaSemana: 1, total: 40 },
            { diaSemana: 7, total: 60 },
          ],
        }),
      );
      expect(r.pico.disponivel).toBe(true);
      expect(r.pico.porHora).toHaveLength(24);
      expect(r.pico.porHora![0]).toBe(1);
      expect(r.pico.porHora![23]).toBe(99);
      expect(r.pico.porDiaSemana).toEqual([40, 0, 0, 0, 0, 0, 60]);
    });
  });

  describe('Cenário: inícios de panfleto e intervalo', () => {
    it('Então repassa como vieram', () => {
      const inicios = [{ data: d('2026-11-02'), filialId: 'a' }];
      const r = montarResumo(entrada({ iniciosPanfleto: inicios }));
      expect(r.iniciosPanfleto).toEqual(inicios);
      expect(r.intervalo).toEqual({ inicio: '2026-11-01', fim: '2026-11-05' });
    });
  });
});
