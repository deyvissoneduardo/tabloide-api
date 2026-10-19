import type { ClockService } from '../../../common/clock/clock.service';
import type { DataISO } from '../../../common/utils/date-only';
import { VigenciaService } from '../services/vigencia.service';

const servicoEm = (instante: string) =>
  new VigenciaService({ agora: () => new Date(instante) } as unknown as ClockService);

describe('Funcionalidade: Hoje da filial', () => {
  describe('Cenário: usa o fuso da filial', () => {
    it('Então às 03:30Z do dia 19 é dia 18 em Manaus e dia 19 em São Paulo', () => {
      const service = servicoEm('2026-10-19T03:30:00Z');
      expect(service.hojeDaFilial({ fusoHorario: 'America/Manaus' })).toBe('2026-10-18');
      expect(service.hojeDaFilial({ fusoHorario: 'America/Sao_Paulo' })).toBe('2026-10-19');
    });
  });

  describe('Cenário: situacaoDe combina relógio, fuso e calcularSituacao', () => {
    it('Então item com limite ontem está VENCIDO', () =>
      expect(
        servicoEm('2026-10-18T12:00:00Z').situacaoDe(
          { dataInicio: '2026-10-01' as DataISO, dataLimite: '2026-10-17' as DataISO, deletedAt: null },
          { fusoHorario: 'America/Sao_Paulo' },
        ),
      ).toBe('VENCIDO'));
  });
});
