import type { ClockService } from '../../../common/clock/clock.service';
import { AppError } from '../../../common/errors/app.error';
import { naoEncontrado } from '../../../common/errors/errors';
import type { FiliaisService } from '../../filiais/services/filiais.service';
import type { AcessosQuery } from '../services/acessos.query';
import { AcessosPanfletosService } from '../services/acessos-panfletos.service';

describe('Funcionalidade: acessos por panfleto (RN55, RN56)', () => {
  const query = { panfletosDaFilial: jest.fn(), somaPorIntervalos: jest.fn() };
  const filiais = { obter: jest.fn() };
  const service = new AcessosPanfletosService(
    query as unknown as AcessosQuery,
    filiais as unknown as FiliaisService,
    // 12:00 em São Paulo, 09/11
    { agora: () => new Date('2026-11-09T15:00:00Z') } as ClockService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    filiais.obter.mockResolvedValue({ id: 'f1', fusoHorario: 'America/Sao_Paulo' });
    query.somaPorIntervalos.mockResolvedValue(new Map());
  });

  const panfleto = (
    id: string,
    dataInicio: string,
    dataLimite: string | null,
    deletedAt: Date | null = null,
  ) => ({
    id,
    dataInicio,
    dataLimite,
    deletedAt,
  });

  describe('Cenário: panfleto que começou antes do filtro', () => {
    it('Então conta a vigência efetiva inteira, não só o filtro', async () => {
      query.panfletosDaFilial.mockResolvedValue([panfleto('p1', '2026-10-20', '2026-11-15')]);
      query.somaPorIntervalos.mockResolvedValue(new Map([['p1', 980]]));
      const r = await service.listar('t1', 'f1', { periodo: 7 });
      expect(query.somaPorIntervalos).toHaveBeenCalledWith('t1', 'f1', [
        { panfletoId: 'p1', inicio: '2026-10-20', fim: '2026-11-09' },
      ]);
      expect(r).toEqual([
        {
          panfletoId: 'p1',
          dataInicio: '2026-10-20',
          dataLimite: '2026-11-15',
          dataFimContagem: '2026-11-09',
          situacao: 'VIGENTE',
          totalAcessos: 980,
          dias: 21,
          mediaPorDia: 46.7,
        },
      ]);
    });
  });

  describe('Cenário: filtra pela vigência que cruza o período e ordena do mais recente', () => {
    it('Então o vencido fora do filtro some e a exclusão usa a data local', async () => {
      query.panfletosDaFilial.mockResolvedValue([
        panfleto('antigo', '2026-09-01', '2026-09-30'),
        // 01:00 UTC de 05/11 = 22:00 de 04/11 em São Paulo
        panfleto('excluido', '2026-11-01', null, new Date('2026-11-05T01:00:00Z')),
        panfleto('atual', '2026-11-05', null),
      ]);
      const r = await service.listar('t1', 'f1', { periodo: 15 });
      expect(
        r.map((x) => [x.panfletoId, x.situacao, x.dataFimContagem, x.totalAcessos, x.mediaPorDia]),
      ).toEqual([
        ['atual', 'VIGENTE', '2026-11-09', 0, 0],
        ['excluido', 'EXCLUIDO', '2026-11-04', 0, 0],
      ]);
      expect(query.panfletosDaFilial).toHaveBeenCalledWith('t1', 'f1', '2026-11-09');
    });
  });

  describe('Cenário: filial de outro lojista ou excluída', () => {
    it('Então 404 sem consultar os panfletos', async () => {
      filiais.obter.mockRejectedValue(naoEncontrado());
      await expect(service.listar('t1', 'f1', {})).rejects.toMatchObject({
        codigo: 'RECURSO_NAO_ENCONTRADO',
      });
      expect(query.panfletosDaFilial).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: período personalizado validado com o hoje da filial', () => {
    it('Então fim amanhã é PERIODO_INVALIDO/FIM_NO_FUTURO', async () => {
      const e = (await service
        .listar('t1', 'f1', { inicio: '2026-11-01' as never, fim: '2026-11-10' as never })
        .catch((x: unknown) => x)) as AppError;
      expect([e.codigo, e.detalhes?.motivo]).toEqual(['PERIODO_INVALIDO', 'FIM_NO_FUTURO']);
    });
  });

  describe('Cenário: mesmo dia de início (excluído e substituto)', () => {
    it('Então ambos aparecem, sem total no banco vira 0', async () => {
      query.panfletosDaFilial.mockResolvedValue([
        panfleto('a', '2026-11-05', null, new Date('2026-11-06T15:00:00Z')),
        panfleto('b', '2026-11-05', null),
        panfleto('c', '2026-11-01', '2026-11-03'),
      ]);
      query.somaPorIntervalos.mockResolvedValue(new Map([['b', 10]]));
      const r = await service.listar('t1', 'f1', { periodo: 30 });
      expect(r.map((x) => [x.panfletoId, x.totalAcessos])).toEqual([
        ['a', 0],
        ['b', 10],
        ['c', 0],
      ]);
    });
  });
});
