import type { Sequelize } from 'sequelize-typescript';
import type { DataISO } from '../../../common/utils/date-only';
import { AcessosQuery } from '../services/acessos.query';

const d = (s: string) => s as DataISO;
const INTERVALOS = [
  { filialId: 'f1', inicio: d('2026-11-01'), fim: d('2026-11-07') },
  { filialId: 'f2', inicio: d('2026-10-31'), fim: d('2026-11-06') },
];

/** O SQL roda de verdade nos testes de integração; aqui só o contrato com o banco (D9). */
describe('Funcionalidade: consultas do painel de acessos (D9)', () => {
  const sequelize = { query: jest.fn() };
  const query = new AcessosQuery(sequelize as unknown as Sequelize);
  const chamada = (i = 0) =>
    sequelize.query.mock.calls[i] as [string, { replacements: Record<string, unknown> }];

  beforeEach(() => jest.resetAllMocks());

  describe('Cenário: toda consulta leva tenant_id explícito', () => {
    it('Então filiais, inícios e panfletos filtram pelo tenant', async () => {
      sequelize.query.mockResolvedValue([]);
      await query.filiaisDoLojista('t1');
      await query.iniciosPanfleto('t1', { inicio: d('2026-11-01'), fim: d('2026-11-07') });
      await query.iniciosPanfleto('t1', { inicio: d('2026-11-01'), fim: d('2026-11-07') }, 'f1');
      await query.panfletosDaFilial('t1', 'f1', d('2026-11-09'));
      for (let i = 0; i < 4; i++) {
        expect(chamada(i)[0]).toContain('tenant_id = :tenantId');
        expect(chamada(i)[1].replacements.tenantId).toBe('t1');
      }
      expect(chamada(1)[1].replacements.filialId).toBeNull();
      expect(chamada(2)[1].replacements.filialId).toBe('f1');
      expect(chamada(3)[1].replacements).toEqual({ tenantId: 't1', filialId: 'f1', hoje: '2026-11-09' });
    });
  });

  describe('Cenário: totais por filial', () => {
    it('Então monta o VALUES por replacements, nunca concatenando valores', async () => {
      sequelize.query.mockResolvedValue([{ filialId: 'f1', total: 9 }]);
      const totais = await query.totaisPorFilial('t1', INTERVALOS);
      expect(totais).toEqual(new Map([['f1', 9]]));
      const [sql, { replacements }] = chamada();
      expect(sql).toContain('(CAST(:id1 AS uuid), CAST(:i1 AS date), CAST(:f1 AS date))');
      expect(sql).not.toContain('2026-11-01');
      expect(replacements).toEqual({
        tenantId: 't1',
        id0: 'f1',
        i0: '2026-11-01',
        f0: '2026-11-07',
        id1: 'f2',
        i1: '2026-10-31',
        f1: '2026-11-06',
      });
    });
  });

  describe('Cenário: agregados por GROUPING SETS', () => {
    it('Então separa as linhas por data, hora e dia da semana', async () => {
      sequelize.query.mockResolvedValue([
        { data: '2026-11-02', hora: null, diaSemana: 1, gData: 0, gHora: 1, total: 5 },
        { data: null, hora: 9, diaSemana: null, gData: 1, gHora: 0, total: 5 },
        { data: null, hora: null, diaSemana: 1, gData: 1, gHora: 1, total: 5 },
      ]);
      const r = await query.agregados('t1', INTERVALOS, 'f1');
      expect(r).toEqual({
        porData: [{ data: '2026-11-02', total: 5 }],
        porHora: [{ hora: 9, total: 5 }],
        porDiaSemana: [{ diaSemana: 1, total: 5 }],
      });
      expect(chamada()[0]).toContain('GROUPING SETS');
      expect(chamada()[1].replacements.filialId).toBe('f1');
    });

    it('E sem filtro de filial passa null', async () => {
      sequelize.query.mockResolvedValue([]);
      await query.agregados('t1', INTERVALOS);
      expect(chamada()[1].replacements.filialId).toBeNull();
    });
  });

  describe('Cenário: soma por panfleto', () => {
    it('Então usa LEFT JOIN para devolver 0 a panfleto sem acesso', async () => {
      sequelize.query.mockResolvedValue([{ panfletoId: 'p1', total: 0 }]);
      const r = await query.somaPorIntervalos('t1', 'f1', [
        { panfletoId: 'p1', inicio: d('2026-11-01'), fim: d('2026-11-09') },
      ]);
      expect(r).toEqual(new Map([['p1', 0]]));
      expect(chamada()[0]).toContain('LEFT JOIN acessos_filial');
      expect(chamada()[1].replacements).toEqual(
        expect.objectContaining({ tenantId: 't1', filialId: 'f1', id0: 'p1' }),
      );
    });
  });

  describe('Cenário: sem intervalos', () => {
    it('Então não vai ao banco (VALUES vazio seria SQL inválido)', async () => {
      expect(await query.totaisPorFilial('t1', [])).toEqual(new Map());
      expect(await query.agregados('t1', [])).toEqual({ porData: [], porHora: [], porDiaSemana: [] });
      expect(await query.somaPorIntervalos('t1', 'f1', [])).toEqual(new Map());
      expect(sequelize.query).not.toHaveBeenCalled();
    });
  });
});
