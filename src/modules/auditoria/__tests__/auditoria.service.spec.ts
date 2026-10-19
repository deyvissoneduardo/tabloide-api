import type { ClsService } from 'nestjs-cls';
import type { Transaction } from 'sequelize';
import { validate as ehUuid } from 'uuid';
import type { ClockService } from '../../../common/clock/clock.service';
import type { AuditoriaAlteracao } from '../models/auditoria-alteracao.model';
import { AuditoriaService, CAMPOS_AUDITADOS } from '../services/auditoria.service';

const AGORA = new Date('2026-10-18T12:00:00Z');
const T = { id: 'tx' } as unknown as Transaction;

describe('Funcionalidade: Registro de alterações (RNF07)', () => {
  const model = { bulkCreate: jest.fn(), findAndCountAll: jest.fn() };
  const cls = { getId: jest.fn() };
  let service: AuditoriaService;

  beforeEach(() => {
    jest.resetAllMocks();
    cls.getId.mockReturnValue('req-1');
    service = new AuditoriaService(
      model as unknown as typeof AuditoriaAlteracao,
      { agora: () => AGORA } as ClockService,
      cls as unknown as ClsService,
    );
  });

  const registrar = (
    antes: object,
    depois: object,
    opts: { transaction: Transaction } = { transaction: T },
  ) =>
    service.registrarAlteracoes(
      'T1',
      'PRODUTO',
      'P1',
      antes as never,
      depois as never,
      CAMPOS_AUDITADOS.PRODUTO,
      opts,
    );
  const linhas = () => model.bulkCreate.mock.calls[0]?.[0] as Array<Record<string, unknown>>;

  describe('Cenário: grava só os campos auditados que mudaram', () => {
    it('Então um único bulkCreate com 1 linha, valores serializados, instante e requestId', async () => {
      const gravadas = await registrar(
        { precoPromocionalCentavos: 899, nome: 'Arroz', dataLimite: '2026-10-30' },
        { precoPromocionalCentavos: 799, nome: 'Arroz 5kg', dataLimite: '2026-10-30' },
      );
      expect(gravadas).toBe(1);
      expect(model.bulkCreate).toHaveBeenCalledTimes(1);
      expect(linhas()).toHaveLength(1);
      expect(linhas()[0]).toMatchObject({
        tenantId: 'T1',
        entidade: 'PRODUTO',
        entidadeId: 'P1',
        campo: 'precoPromocionalCentavos',
        valorAnterior: '899',
        valorNovo: '799',
        alteradoEm: AGORA,
        requestId: 'req-1',
      });
      expect(ehUuid(linhas()[0]!.id as string)).toBe(true);
    });
  });

  describe('Cenário: várias mudanças na mesma chamada viram um único INSERT', () => {
    it('Então 3 linhas na ordem dos campos auditados, com o mesmo alteradoEm', async () => {
      await registrar(
        { precoPromocionalCentavos: 899, precoOriginalCentavos: 1299, dataLimite: '2026-10-30' },
        { dataLimite: '2026-10-25', precoOriginalCentavos: 1199, precoPromocionalCentavos: 799 },
      );
      expect(linhas().map((l) => l.campo)).toEqual([
        'precoPromocionalCentavos',
        'precoOriginalCentavos',
        'dataLimite',
      ]);
      expect(new Set(linhas().map((l) => l.alteradoEm)).size).toBe(1);
    });
  });

  describe('Cenário: nada mudou', () => {
    it('Então bulkCreate não é chamado e retorna 0', async () => {
      expect(await registrar({ precoPromocionalCentavos: 799 }, { precoPromocionalCentavos: 799 })).toBe(0);
      expect(model.bulkCreate).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: campo não enviado não é auditado', () => {
    it('Então dataLimite não gera linha', async () => {
      await registrar(
        { dataLimite: '2026-10-30', precoPromocionalCentavos: 1 },
        { precoPromocionalCentavos: 2 },
      );
      expect(linhas().map((l) => l.campo)).toEqual(['precoPromocionalCentavos']);
    });
  });

  describe.each([
    ['remover data limite', { dataLimite: '2026-10-30' }, { dataLimite: null }, '2026-10-30', null],
    [
      'definir data limite onde não havia',
      { dataLimite: null },
      { dataLimite: '2026-10-30' },
      null,
      '2026-10-30',
    ],
    [
      'preço original removido',
      { precoOriginalCentavos: 1299 },
      { precoOriginalCentavos: null },
      '1299',
      null,
    ],
  ])('Cenário: %s', (_nome, antes, depois, anterior, novo) => {
    it(`Então a linha tem anterior ${anterior} e novo ${novo}`, async () => {
      await registrar(antes, depois);
      expect(linhas()[0]).toMatchObject({ valorAnterior: anterior, valorNovo: novo });
    });
  });

  describe('Cenário: undefined e null são equivalentes', () => {
    it('Então nenhuma linha é gravada', async () => {
      expect(await registrar({ precoOriginalCentavos: undefined }, { precoOriginalCentavos: null })).toBe(0);
    });
  });

  describe('Cenário: número e string iguais não geram diferença falsa', () => {
    it('Então 799 e "799" são o mesmo valor', async () => {
      expect(await registrar({ precoPromocionalCentavos: 799 }, { precoPromocionalCentavos: '799' })).toBe(0);
    });
  });

  describe('Cenário: registro de criação', () => {
    it('Então grava só os campos com valor, todos com anterior nulo', async () => {
      const gravadas = await service.registrarCriacao(
        'T1',
        'PRODUTO',
        'P1',
        {
          precoPromocionalCentavos: 799,
          precoOriginalCentavos: null,
          dataInicio: '2026-10-18',
          dataLimite: null,
        },
        CAMPOS_AUDITADOS.PRODUTO,
        { transaction: T },
      );
      expect(gravadas).toBe(2);
      expect(linhas().map((l) => [l.campo, l.valorAnterior, l.valorNovo])).toEqual([
        ['precoPromocionalCentavos', null, '799'],
        ['dataInicio', null, '2026-10-18'],
      ]);
    });
  });

  describe('Cenário: transação é obrigatória', () => {
    it('Então lança "auditoria exige transação" e não grava', async () => {
      await expect(
        registrar({}, { precoPromocionalCentavos: 1 }, {} as unknown as { transaction: Transaction }),
      ).rejects.toThrow('auditoria exige transação');
      await expect(
        service.registrarAlteracoes('T1', 'PRODUTO', 'P1', {}, {}, [], undefined as never),
      ).rejects.toThrow('auditoria exige transação');
      expect(model.bulkCreate).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: transação é repassada ao bulkCreate', () => {
    it('Então bulkCreate recebe { transaction: T } sem RETURNING', async () => {
      await registrar({}, { precoPromocionalCentavos: 1 });
      expect(model.bulkCreate.mock.calls[0]![1]).toEqual({
        transaction: T,
        returning: false,
        validate: false,
      });
    });
  });

  describe('Cenário: sem requestId no contexto', () => {
    it('Então requestId é nulo', async () => {
      cls.getId.mockReturnValue(undefined);
      await registrar({}, { precoPromocionalCentavos: 1 });
      expect(linhas()[0]!.requestId).toBeNull();
    });
  });

  describe('Cenário: listar filtra por tenant, entidade e id, do mais recente para o mais antigo', () => {
    it('Então findAndCountAll recebe where, order, limit e offset certos', async () => {
      model.findAndCountAll.mockResolvedValue({ rows: ['a'], count: 11 });
      await expect(
        service.listar('T1', { entidade: 'PRODUTO', entidadeId: 'P1', pagina: 2, porPagina: 10 }),
      ).resolves.toEqual({ itens: ['a'], total: 11 });
      expect(model.findAndCountAll).toHaveBeenCalledWith({
        where: { tenantId: 'T1', entidade: 'PRODUTO', entidadeId: 'P1' },
        attributes: { exclude: ['tenantId'] },
        order: [
          ['alteradoEm', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: 10,
        offset: 10,
      });
    });
  });
});
