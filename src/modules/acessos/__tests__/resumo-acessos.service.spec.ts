import type { ClockService } from '../../../common/clock/clock.service';
import { AppError } from '../../../common/errors/app.error';
import type { AppConfig } from '../../../config/app.config';
import type { AcessosQuery } from '../services/acessos.query';
import { ResumoAcessosService } from '../services/resumo-acessos.service';

const SP = { id: 'sp', nome: 'Centro', fusoHorario: 'America/Sao_Paulo', deletedAt: null };
const MAO = { id: 'mao', nome: 'Manaus', fusoHorario: 'America/Manaus', deletedAt: null };
const VELHA = {
  id: 'velha',
  nome: 'Antiga',
  fusoHorario: 'America/Sao_Paulo',
  deletedAt: new Date('2026-10-01T12:00:00Z'),
};

describe('Funcionalidade: resumo de acessos do lojista (RN53, RN54, RN57)', () => {
  const query = {
    filiaisDoLojista: jest.fn(),
    totaisPorFilial: jest.fn(),
    agregados: jest.fn(),
    iniciosPanfleto: jest.fn(),
  };
  // 00:30 em Brasília: São Paulo já está em 10/11, Manaus ainda em 09/11
  let agora = new Date('2026-11-10T03:30:00Z');
  const service = new ResumoAcessosService(
    query as unknown as AcessosQuery,
    { agora: () => agora } as ClockService,
    { fusoHorarioPadrao: 'America/Sao_Paulo' } as AppConfig,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    agora = new Date('2026-11-10T03:30:00Z');
    query.filiaisDoLojista.mockResolvedValue([SP, MAO, VELHA]);
    query.totaisPorFilial.mockResolvedValue(new Map([['sp', 5]]));
    query.agregados.mockResolvedValue({ porData: [], porHora: [], porDiaSemana: [] });
    query.iniciosPanfleto.mockResolvedValue([]);
  });

  const erro = async (p: Promise<unknown>) => {
    const e = (await p.catch((x: unknown) => x)) as AppError;
    expect(e).toBeInstanceOf(AppError);
    return { codigo: e.codigo, motivo: e.detalhes?.motivo };
  };

  describe('Cenário: período predefinido com fusos diferentes', () => {
    it('Então cada filial usa o próprio hoje e o intervalo vai do menor início ao maior fim', async () => {
      const r = await service.resumo('t1', { periodo: 7 });
      const [, intervalos] = query.totaisPorFilial.mock.calls[0];
      expect(intervalos).toEqual([
        { filialId: 'sp', inicio: '2026-11-04', fim: '2026-11-10' },
        { filialId: 'mao', inicio: '2026-11-03', fim: '2026-11-09' },
        { filialId: 'velha', inicio: '2026-11-04', fim: '2026-11-10' },
      ]);
      expect(r.intervalo).toEqual({ inicio: '2026-11-03', fim: '2026-11-10' });
      expect(r.porDia).toHaveLength(8);
      expect(query.agregados).toHaveBeenCalledWith('t1', intervalos, undefined);
      expect(query.iniciosPanfleto).toHaveBeenCalledWith('t1', r.intervalo, undefined);
    });

    it('E sem parâmetros vale 30 dias', async () => {
      const r = await service.resumo('t1', { filialId: 'sp' });
      expect(r.intervalo).toEqual({ inicio: '2026-10-12', fim: '2026-11-10' });
    });
  });

  describe('Cenário: filtro por filial', () => {
    it('Então os agregados usam só o intervalo dela, mas o ranking continua com todas', async () => {
      await service.resumo('t1', { periodo: 1, filialId: 'mao' });
      expect(query.agregados).toHaveBeenCalledWith(
        't1',
        [{ filialId: 'mao', inicio: '2026-11-09', fim: '2026-11-09' }],
        'mao',
      );
      expect(query.totaisPorFilial.mock.calls[0][1]).toHaveLength(3);
    });

    it('E aceita a filial excluída do próprio lojista (RN57)', async () => {
      await expect(service.resumo('t1', { filialId: 'velha' })).resolves.toBeDefined();
    });

    it('E responde 404 para filial de outro lojista ou inexistente', async () => {
      expect(await erro(service.resumo('t1', { filialId: 'de-outro' }))).toEqual({
        codigo: 'RECURSO_NAO_ENCONTRADO',
        motivo: undefined,
      });
    });
  });

  describe('Cenário: período personalizado validado contra o maior hoje das filiais ativas', () => {
    it('Então fim = hoje de São Paulo é aceito, mesmo com Manaus um dia atrás', async () => {
      const r = await service.resumo('t1', { inicio: '2026-11-01' as never, fim: '2026-11-10' as never });
      expect(r.intervalo).toEqual({ inicio: '2026-11-01', fim: '2026-11-10' });
    });

    it('E fim amanhã é FIM_NO_FUTURO', async () => {
      expect(
        await erro(service.resumo('t1', { inicio: '2026-11-01' as never, fim: '2026-11-11' as never })),
      ).toEqual({
        codigo: 'PERIODO_INVALIDO',
        motivo: 'FIM_NO_FUTURO',
      });
    });

    it('E só a filial de Manaus ativa: o hoje é o de Manaus', async () => {
      query.filiaisDoLojista.mockResolvedValue([MAO, VELHA]);
      expect(
        await erro(service.resumo('t1', { inicio: '2026-11-01' as never, fim: '2026-11-10' as never })),
      ).toEqual({
        codigo: 'PERIODO_INVALIDO',
        motivo: 'FIM_NO_FUTURO',
      });
    });
  });

  describe('Cenário: lojista sem filiais', () => {
    it('Então usa o fuso padrão e devolve zeros', async () => {
      query.filiaisDoLojista.mockResolvedValue([]);
      query.totaisPorFilial.mockResolvedValue(new Map());
      const r = await service.resumo('t1', { periodo: 1 });
      expect(r).toEqual(
        expect.objectContaining({
          intervalo: { inicio: '2026-11-10', fim: '2026-11-10' },
          total: 0,
          porFilial: [],
          porDia: [{ data: '2026-11-10', total: 0 }],
        }),
      );
      expect(query.agregados).toHaveBeenCalledWith('t1', [], undefined);
    });
  });

  describe('Cenário: combinação inválida', () => {
    it('Então PERIODO_INVALIDO/COMBINACAO antes de ir ao banco', async () => {
      expect(await erro(service.resumo('t1', { periodo: 7, inicio: '2026-11-01' as never }))).toEqual({
        codigo: 'PERIODO_INVALIDO',
        motivo: 'COMBINACAO',
      });
      expect(query.filiaisDoLojista).not.toHaveBeenCalled();
    });
  });
});
