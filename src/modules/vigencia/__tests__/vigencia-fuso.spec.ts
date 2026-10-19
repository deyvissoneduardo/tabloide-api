import type { ClockService } from '../../../common/clock/clock.service';
import { hojeNoFuso, type DataISO } from '../../../common/utils/date-only';
import { calcularSituacao } from '../domain/situacao';
import { VigenciaService } from '../services/vigencia.service';

const d = (s: string) => s as DataISO;
const situacaoEm = (instante: string, fuso: string, inicio: string, limite: string | null) =>
  calcularSituacao(
    { dataInicio: d(inicio), dataLimite: limite === null ? null : d(limite), deletedAt: null },
    hojeNoFuso(fuso, new Date(instante)),
  );

describe('Funcionalidade: Vigência avaliada no fuso da filial (RN24, RNF06)', () => {
  describe('Cenário: 23:30 em Manaus ainda é o dia anterior ao de São Paulo', () => {
    it('Então o item com limite 18/10 está VIGENTE em Manaus e VENCIDO em São Paulo', () => {
      expect(situacaoEm('2026-10-19T03:30:00Z', 'America/Manaus', '2026-10-01', '2026-10-18')).toBe(
        'VIGENTE',
      );
      expect(situacaoEm('2026-10-19T03:30:00Z', 'America/Sao_Paulo', '2026-10-01', '2026-10-18')).toBe(
        'VENCIDO',
      );
    });
  });

  describe('Cenário: início vale a partir de 00:00 local', () => {
    it('Então às 23:59:59 do dia 18 está AGENDADO e às 00:00 do dia 19 está VIGENTE', () => {
      expect(situacaoEm('2026-10-19T02:59:59Z', 'America/Sao_Paulo', '2026-10-19', null)).toBe('AGENDADO');
      expect(situacaoEm('2026-10-19T03:00:00Z', 'America/Sao_Paulo', '2026-10-19', null)).toBe('VIGENTE');
    });
  });

  describe('Cenário: limite vale até 23:59:59 local', () => {
    it('Então às 23:59:59 está VIGENTE e às 00:00 do dia seguinte está VENCIDO', () => {
      expect(situacaoEm('2026-10-19T02:59:59Z', 'America/Sao_Paulo', '2026-10-01', '2026-10-18')).toBe(
        'VIGENTE',
      );
      expect(situacaoEm('2026-10-19T03:00:00Z', 'America/Sao_Paulo', '2026-10-01', '2026-10-18')).toBe(
        'VENCIDO',
      );
    });
  });

  describe('Cenário: virada de dia em UTC não afeta a filial', () => {
    it('Então 00:30Z do dia 19 ainda é dia 18 em São Paulo', () =>
      expect(situacaoEm('2026-10-19T00:30:00Z', 'America/Sao_Paulo', '2026-10-01', '2026-10-18')).toBe(
        'VIGENTE',
      ));
  });

  describe('Cenário: Fernando de Noronha (UTC-2) vira o dia antes', () => {
    it('Então às 02:30Z está VENCIDO em Noronha e VIGENTE em São Paulo', () => {
      expect(situacaoEm('2026-10-19T02:30:00Z', 'America/Noronha', '2026-10-01', '2026-10-18')).toBe(
        'VENCIDO',
      );
      expect(situacaoEm('2026-10-19T02:30:00Z', 'America/Sao_Paulo', '2026-10-01', '2026-10-18')).toBe(
        'VIGENTE',
      );
    });
  });

  describe('Cenário: data histórica com horário de verão usa as regras do tzdata', () => {
    it('Então 2019-01-15T02:30Z já é dia 15 em São Paulo (UTC-2 na época; em UTC-3 seria dia 14)', () =>
      expect(hojeNoFuso('America/Sao_Paulo', new Date('2019-01-15T02:30:00Z'))).toBe('2019-01-15'));

    it('E 2018-11-04T02:30Z ainda é dia 03 (o horário de verão começou às 00:00 locais do dia 04)', () =>
      expect(hojeNoFuso('America/Sao_Paulo', new Date('2018-11-04T02:30:00Z'))).toBe('2018-11-03'));
  });

  describe('Cenário: mesma filial, várias avaliações no mesmo request', () => {
    it('Então o relógio é lido uma vez por chamada e os resultados são iguais', () => {
      const agora = jest.fn(() => new Date('2026-10-18T12:00:00Z'));
      const service = new VigenciaService({ agora } as unknown as ClockService);
      const filial = { fusoHorario: 'America/Sao_Paulo' };
      expect(service.hojeDaFilial(filial)).toBe(service.hojeDaFilial(filial));
      expect(agora).toHaveBeenCalledTimes(2);
    });
  });
});
