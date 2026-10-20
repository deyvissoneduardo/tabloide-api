import type { Sequelize } from 'sequelize-typescript';
import type { Transaction } from 'sequelize';
import type { ClockService } from '../../../common/clock/clock.service';
import type { AppConfig } from '../../../config/app.config';
import type { LojistaLimite } from '../models/lojista-limite.model';
import { LimitesService } from '../services/limites.service';

const T = { id: 'tx' } as unknown as Transaction;

describe('Funcionalidade: Limites por lojista (RNF12)', () => {
  const limiteModel = { findByPk: jest.fn() };
  const sequelize = { query: jest.fn() };
  let agora = 0;
  let service: LimitesService;

  beforeEach(() => {
    jest.resetAllMocks();
    agora = Date.parse('2026-10-18T15:00:00Z');
    service = new LimitesService(
      limiteModel as unknown as typeof LojistaLimite,
      sequelize as unknown as Sequelize,
      { maxImagemBytes: 5_000_000 } as AppConfig,
      { agora: () => new Date(agora) } as ClockService,
    );
  });

  /** O primeiro query é o FOR UPDATE; o segundo, a contagem. */
  const comContagem = (n: number) =>
    sequelize.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ n: String(n) }]);
  const contagem = () => sequelize.query.mock.calls[1];

  describe('Cenário: lojista sem linha de limites', () => {
    it('Então não há erro, contagem nem lock', async () => {
      limiteModel.findByPk.mockResolvedValue(null);
      await expect(service.verificarCriacaoFilial('t1', { transaction: T })).resolves.toBeUndefined();
      expect(sequelize.query).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: coluna nula significa sem limite', () => {
    it('Então max_filiais NULL não conta nada, mesmo com limite de produtos', async () => {
      limiteModel.findByPk.mockResolvedValue({ maxFiliais: null, maxProdutosPorFilial: 10 });
      await service.verificarCriacaoFilial('t1', { transaction: T });
      expect(sequelize.query).not.toHaveBeenCalled();
      expect(limiteModel.findByPk).toHaveBeenCalledWith('t1', { attributes: ['maxFiliais'], transaction: T });
    });
  });

  describe.each<[number, number, boolean]>([
    [3, 2, true],
    [3, 3, false],
    [3, 5, false],
    [0, 0, false],
  ])('Esquema do Cenário: max_filiais = %i com %i filiais', (limite, existentes, permitido) => {
    it(permitido ? 'Então não há erro' : 'Então LIMITE_DO_PLANO_ATINGIDO', async () => {
      limiteModel.findByPk.mockResolvedValue({ maxFiliais: limite });
      comContagem(existentes);
      const resultado = service.verificarCriacaoFilial('t1', { transaction: T });
      if (permitido) await expect(resultado).resolves.toBeUndefined();
      else
        await expect(resultado).rejects.toMatchObject({
          codigo: 'LIMITE_DO_PLANO_ATINGIDO',
          status: 409,
          detalhes: { recurso: 'FILIAIS', limite },
        });
    });
  });

  describe('Cenário: contagem de filiais ignora as excluídas', () => {
    it('Então o SQL filtra tenant e deleted_at', async () => {
      limiteModel.findByPk.mockResolvedValue({ maxFiliais: 2 });
      comContagem(1);
      await service.verificarCriacaoFilial('t1', { transaction: T });
      expect(contagem()![0]).toContain('tenant_id = :tenantId AND deleted_at IS NULL');
    });
  });

  describe('Cenário: limite de produtos é por filial', () => {
    it('Então a contagem filtra a filial e o erro aponta PRODUTOS_POR_FILIAL', async () => {
      limiteModel.findByPk.mockResolvedValue({ maxProdutosPorFilial: 2 });
      comContagem(2);
      await expect(service.verificarCriacaoProduto('t1', 'f1', { transaction: T })).rejects.toMatchObject({
        detalhes: { recurso: 'PRODUTOS_POR_FILIAL', limite: 2 },
      });
      expect(contagem()![0]).toContain('filial_id = :filialId');
      expect(contagem()![1].replacements).toEqual({ tenantId: 't1', filialId: 'f1' });
    });
  });

  describe('Cenário: lock e contagem usam a transação recebida', () => {
    it('Então FOR UPDATE na linha do lojista e count recebem { transaction: T }', async () => {
      limiteModel.findByPk.mockResolvedValue({ maxFiliais: 5 });
      comContagem(0);
      await service.verificarCriacaoFilial('t1', { transaction: T });
      const [lock, count] = sequelize.query.mock.calls;
      expect(lock![0]).toBe('SELECT 1 FROM lojistas WHERE id = :tenantId FOR UPDATE');
      expect(lock![1]).toMatchObject({ transaction: T, replacements: { tenantId: 't1' } });
      expect(count![1]).toMatchObject({ transaction: T });
    });
  });

  describe('Esquema do Cenário: limite de imagem efetivo', () => {
    it.each<[string, { maxImagemBytes: number | null } | null, number]>([
      ['NULL', { maxImagemBytes: null }, 5_000_000],
      ['2000000', { maxImagemBytes: 2_000_000 }, 2_000_000],
      ['9000000', { maxImagemBytes: 9_000_000 }, 5_000_000],
      ['sem linha', null, 5_000_000],
    ])('Dado o limite do lojista %s, então %i', async (_nome, linha, efetivo) => {
      limiteModel.findByPk.mockResolvedValue(linha);
      expect(await service.maxImagemBytes('t1')).toBe(efetivo);
    });
  });

  describe('Cenário: limite de imagem fica em cache por 30 s', () => {
    it('Então duas consultas em 10 s vão ao banco uma vez, e 31 s depois de novo', async () => {
      limiteModel.findByPk.mockResolvedValue(null);
      await service.maxImagemBytes('t1');
      agora += 10_000;
      await service.maxImagemBytes('t1');
      expect(limiteModel.findByPk).toHaveBeenCalledTimes(1);
      agora += 21_000;
      await service.maxImagemBytes('t1');
      expect(limiteModel.findByPk).toHaveBeenCalledTimes(2);
    });
  });
});
