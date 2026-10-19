import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/sequelize';
import { Test } from '@nestjs/testing';
import { UniqueConstraintError } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { validate as ehUuid, version as versaoUuid } from 'uuid';
import { sequelizeFake, transacaoFake } from '../../../../test/helpers/transacao-fake';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { VERIFICADOR_LIMITES } from '../../../common/limites/verificador-limites';
import { AppConfig } from '../../../config/app.config';
import { AuditoriaService, CAMPOS_AUDITADOS } from '../../auditoria/services/auditoria.service';
import type { ExclusaoEmCascataFilial } from '../cascata/exclusao-em-cascata-filial';
import { ExclusaoEmCascataFilialRegistry } from '../cascata/exclusao-em-cascata-filial.registry';
import { Filial } from '../models/filial.model';
import { FiliaisService, MAX_TENTATIVAS_CODIGO } from '../services/filiais.service';
import { GERADOR_CODIGO_PUBLICO } from '../services/gerador-codigo-publico';

const EVENTO = 'filial.conteudo-alterado';

const erroUnico = (constraint: string) =>
  new UniqueConstraintError({ parent: Object.assign(new Error('dup'), { constraint }) as never });

/** Instância falsa de Filial com set/save/destroy observáveis. */
function umaFilial(dados: Partial<Filial> = {}) {
  const filial: Record<string, unknown> = {
    id: 'F1',
    tenantId: 'T1',
    nome: 'Centro',
    endereco: 'Rua A',
    fusoHorario: 'America/Sao_Paulo',
    codigoPublico: 'k7Qm2xPa',
    ...dados,
  };
  filial.set = jest.fn((valores: object) => Object.assign(filial, valores));
  filial.save = jest.fn(async () => filial);
  filial.destroy = jest.fn(async () => undefined);
  return filial as unknown as Filial & { set: jest.Mock; save: jest.Mock; destroy: jest.Mock };
}

describe('Funcionalidade: Gestão de filiais', () => {
  let service: FiliaisService;
  let t: ReturnType<typeof transacaoFake>;
  let sequelize: ReturnType<typeof sequelizeFake>;
  let registry: ExclusaoEmCascataFilialRegistry;
  const filialModel = { create: jest.fn(), findOne: jest.fn(), findAndCountAll: jest.fn() };
  const gerador = { gerar: jest.fn() };
  const auditoria = { registrarCriacao: jest.fn(), registrarAlteracoes: jest.fn() };
  const eventos = { emit: jest.fn() };
  const limites = { verificarCriacaoFilial: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    t = transacaoFake();
    sequelize = sequelizeFake(t);
    registry = new ExclusaoEmCascataFilialRegistry();
    gerador.gerar.mockReturnValue('k7Qm2xPa');
    filialModel.create.mockImplementation(async (v) => ({ ...v }));
    const modulo = await Test.createTestingModule({
      providers: [
        FiliaisService,
        { provide: getModelToken(Filial), useValue: filialModel },
        { provide: Sequelize, useValue: sequelize },
        { provide: GERADOR_CODIGO_PUBLICO, useValue: gerador },
        { provide: ExclusaoEmCascataFilialRegistry, useValue: registry },
        { provide: VERIFICADOR_LIMITES, useValue: limites },
        { provide: AuditoriaService, useValue: auditoria },
        { provide: EventEmitter2, useValue: eventos },
        { provide: AppConfig, useValue: { fusoHorarioPadrao: 'America/Sao_Paulo' } },
      ],
    }).compile();
    service = modulo.get(FiliaisService);
  });

  describe('Funcionalidade: criar', () => {
    describe('Cenário: cria filial com fuso padrão (RN38)', () => {
      let filial: Filial;
      beforeEach(async () => {
        filial = await service.criar('T1', { nome: 'Centro', endereco: 'Rua A, 100' });
      });

      it('Então create recebe tenant, dados, fuso padrão e código, com a transação', () => {
        const [dados, opcoes] = filialModel.create.mock.calls[0]!;
        expect(dados).toMatchObject({
          tenantId: 'T1',
          nome: 'Centro',
          endereco: 'Rua A, 100',
          fusoHorario: 'America/Sao_Paulo',
          codigoPublico: 'k7Qm2xPa',
        });
        expect(opcoes).toEqual({ transaction: t });
      });

      it('E o id é UUID v7', () => expect(ehUuid(filial.id) && versaoUuid(filial.id)).toBe(7));

      it('E a auditoria registra a criação do fuso', () =>
        expect(auditoria.registrarCriacao).toHaveBeenCalledWith(
          'T1',
          'FILIAL',
          filial.id,
          { fusoHorario: 'America/Sao_Paulo' },
          CAMPOS_AUDITADOS.FILIAL,
          { transaction: t },
        ));

      it('E após o commit emite filial.conteudo-alterado', () =>
        expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 'T1', filialId: filial.id }));
    });

    describe('Cenário: normaliza o fuso informado', () => {
      it('Então "america/manaus" vira "America/Manaus"', async () => {
        const filial = await service.criar('T1', { nome: 'C', endereco: 'R', fusoHorario: 'america/manaus' });
        expect(filial.fusoHorario).toBe('America/Manaus');
      });
    });

    describe('Cenário: fuso inválido', () => {
      it('Então FUSO_HORARIO_INVALIDO com o campo, sem transação nem create', async () => {
        await expect(
          service.criar('T1', { nome: 'C', endereco: 'R', fusoHorario: 'Marte/Olympus' }),
        ).rejects.toMatchObject({
          codigo: CodigoErro.FUSO_HORARIO_INVALIDO,
          detalhes: { campo: 'fusoHorario' },
        });
        expect(sequelize.transaction).not.toHaveBeenCalled();
        expect(filialModel.create).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: verifica limites antes de criar (gancho RNF12)', () => {
      it('Então verificarCriacaoFilial roda na transação, antes de create', async () => {
        await service.criar('T1', { nome: 'C', endereco: 'R' });
        expect(limites.verificarCriacaoFilial).toHaveBeenCalledWith('T1', { transaction: t });
        expect(limites.verificarCriacaoFilial.mock.invocationCallOrder[0]).toBeLessThan(
          filialModel.create.mock.invocationCallOrder[0]!,
        );
      });
    });

    describe('Cenário: limite atingido', () => {
      it('Então LIMITE_DO_PLANO_ATINGIDO, sem create nem evento', async () => {
        limites.verificarCriacaoFilial.mockRejectedValue(new AppError(CodigoErro.LIMITE_DO_PLANO_ATINGIDO));
        await expect(service.criar('T1', { nome: 'C', endereco: 'R' })).rejects.toMatchObject({
          codigo: CodigoErro.LIMITE_DO_PLANO_ATINGIDO,
        });
        expect(filialModel.create).not.toHaveBeenCalled();
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: colisão de código público é retentada (RN39)', () => {
      it('Então create é chamado 2 vezes e a filial fica com o segundo código, em savepoint', async () => {
        gerador.gerar.mockReturnValueOnce('AAAAAAAA').mockReturnValueOnce('BBBBBBBB');
        filialModel.create.mockRejectedValueOnce(erroUnico('filiais_codigo_publico_uk'));
        const filial = await service.criar('T1', { nome: 'C', endereco: 'R' });
        expect(filialModel.create).toHaveBeenCalledTimes(2);
        expect(filial.codigoPublico).toBe('BBBBBBBB');
        expect(sequelize.transaction).toHaveBeenCalledWith({ transaction: t }, expect.any(Function));
        expect(eventos.emit).toHaveBeenCalledTimes(1);
      });
    });

    describe('Cenário: colisões esgotam as tentativas', () => {
      it(`Então create é chamado ${MAX_TENTATIVAS_CODIGO} vezes, erro interno e nenhum evento`, async () => {
        filialModel.create.mockRejectedValue(erroUnico('filiais_codigo_publico_uk'));
        await expect(service.criar('T1', { nome: 'C', endereco: 'R' })).rejects.toThrow(
          'falha ao gerar código público único',
        );
        expect(filialModel.create).toHaveBeenCalledTimes(MAX_TENTATIVAS_CODIGO);
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: outro erro de unicidade não é retentado', () => {
      it('Então o erro é relançado após 1 create', async () => {
        const erro = erroUnico('outra_uk');
        filialModel.create.mockRejectedValue(erro);
        await expect(service.criar('T1', { nome: 'C', endereco: 'R' })).rejects.toBe(erro);
        expect(filialModel.create).toHaveBeenCalledTimes(1);
      });
    });

    describe('Cenário: erro que não é de unicidade não é retentado', () => {
      it('Então é relançado', async () => {
        filialModel.create.mockRejectedValue(new Error('conexão caiu'));
        await expect(service.criar('T1', { nome: 'C', endereco: 'R' })).rejects.toThrow('conexão caiu');
        expect(filialModel.create).toHaveBeenCalledTimes(1);
      });
    });

    describe('Cenário: evento só após commit', () => {
      it('Então nada é emitido se a transação não chega ao commit', async () => {
        sequelize.transaction.mockImplementation(
          async (opcoesOuCb: unknown, cb?: (t: unknown) => unknown) => {
            const fn = (cb ?? opcoesOuCb) as (t: unknown) => unknown;
            const r = await fn(t);
            if (!cb) throw new Error('falha no commit');
            return r;
          },
        );
        await expect(service.criar('T1', { nome: 'C', endereco: 'R' })).rejects.toThrow('falha no commit');
        expect(t.afterCommit).toHaveBeenCalled();
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });
  });

  describe('Funcionalidade: listar e obter', () => {
    describe('Cenário: lista paginada do tenant', () => {
      it('Então filtra pelo tenant, ordena por nome pt-BR e id e não traz tenantId nem deletedAt', async () => {
        filialModel.findAndCountAll.mockResolvedValue({ rows: ['f'], count: 11 });
        await expect(service.listar('T1', { pagina: 2, porPagina: 10 })).resolves.toEqual({
          itens: ['f'],
          total: 11,
        });
        const [opcoes] = filialModel.findAndCountAll.mock.calls[0]!;
        expect(opcoes).toMatchObject({ where: { tenantId: 'T1' }, limit: 10, offset: 10 });
        expect(opcoes.order[0][0].val).toBe('nome COLLATE "pt-BR-x-icu"');
        expect(opcoes.order[1]).toEqual(['id', 'ASC']);
        expect(opcoes.attributes).not.toContain('tenantId');
        expect(opcoes.attributes).not.toContain('deletedAt');
      });
    });

    describe('Cenário: obter filial do tenant', () => {
      it('Então busca por id e tenant', async () => {
        const filial = umaFilial();
        filialModel.findOne.mockResolvedValue(filial);
        await expect(service.obter('T1', 'F1')).resolves.toBe(filial);
        expect(filialModel.findOne).toHaveBeenCalledWith({
          where: { id: 'F1', tenantId: 'T1' },
          transaction: undefined,
          lock: undefined,
        });
      });

      it('E repassa transação e lock quando informados', async () => {
        filialModel.findOne.mockResolvedValue(umaFilial());
        await service.obter('T1', 'F1', { transaction: t, lock: t.LOCK.UPDATE });
        expect(filialModel.findOne).toHaveBeenCalledWith(
          expect.objectContaining({ transaction: t, lock: 'UPDATE' }),
        );
      });
    });

    describe('Cenário: obter filial inexistente ou de outro tenant', () => {
      it('Então RECURSO_NAO_ENCONTRADO', async () => {
        filialModel.findOne.mockResolvedValue(null);
        await expect(service.obter('T1', 'F9')).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
      });
    });
  });

  describe('Funcionalidade: editar', () => {
    describe('Cenário: edita nome e endereço sem auditoria', () => {
      it('Então salva com lock de UPDATE, não audita e emite após o commit', async () => {
        const filial = umaFilial();
        filialModel.findOne.mockResolvedValue(filial);
        await service.editar('T1', 'F1', { nome: 'Centro Novo', endereco: 'Rua B' });
        expect(filialModel.findOne).toHaveBeenCalledWith(
          expect.objectContaining({ lock: 'UPDATE', transaction: t }),
        );
        expect(filial.set).toHaveBeenCalledWith({ nome: 'Centro Novo', endereco: 'Rua B' });
        expect(filial.save).toHaveBeenCalledWith({ transaction: t });
        expect(auditoria.registrarAlteracoes).not.toHaveBeenCalled();
        expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 'T1', filialId: 'F1' });
      });
    });

    describe('Cenário: edita o fuso com auditoria (D7)', () => {
      it('Então registra antes e depois do fuso, já normalizado', async () => {
        filialModel.findOne.mockResolvedValue(umaFilial());
        await service.editar('T1', 'F1', { fusoHorario: 'america/manaus' });
        expect(auditoria.registrarAlteracoes).toHaveBeenCalledWith(
          'T1',
          'FILIAL',
          'F1',
          { fusoHorario: 'America/Sao_Paulo' },
          { fusoHorario: 'America/Manaus' },
          CAMPOS_AUDITADOS.FILIAL,
          { transaction: t },
        );
      });
    });

    describe('Cenário: edita com fuso inválido', () => {
      it('Então FUSO_HORARIO_INVALIDO sem abrir transação', async () => {
        await expect(service.editar('T1', 'F1', { fusoHorario: 'xyz' })).rejects.toMatchObject({
          codigo: CodigoErro.FUSO_HORARIO_INVALIDO,
        });
        expect(sequelize.transaction).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: edita filial inexistente', () => {
      it('Então RECURSO_NAO_ENCONTRADO e nenhum evento', async () => {
        filialModel.findOne.mockResolvedValue(null);
        await expect(service.editar('T1', 'F9', { nome: 'X' })).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });
  });

  describe('Funcionalidade: excluir', () => {
    const registrar = (nome: string, ordem: number, impl?: () => Promise<number>) => {
      const h: ExclusaoEmCascataFilial = { nome, ordem, excluirPorFilial: jest.fn(impl ?? (async () => 1)) };
      registry.registrar(h);
      return h;
    };

    describe('Cenário: exclui em cascata na ordem dos handlers (RN12, RN25)', () => {
      it('Então handlers em sequência, mesma transação, destroy por último e evento após o commit', async () => {
        const filial = umaFilial();
        filialModel.findOne.mockResolvedValue(filial);
        const panfletos = registrar('panfletos', 30);
        const produtos = registrar('produtos', 10);
        const categorias = registrar('categorias', 20);

        await service.excluir('T1', 'F1');

        const ordem = [produtos, categorias, panfletos].map(
          (h) => (h.excluirPorFilial as jest.Mock).mock.invocationCallOrder[0]!,
        );
        expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
        for (const h of [produtos, categorias, panfletos]) {
          expect(h.excluirPorFilial).toHaveBeenCalledWith('T1', 'F1', { transaction: t });
        }
        expect(filial.destroy).toHaveBeenCalledWith({ transaction: t });
        expect(filial.destroy.mock.invocationCallOrder[0]).toBeGreaterThan(ordem[2]!);
        expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 'T1', filialId: 'F1' });
      });
    });

    describe('Cenário: exclui sem handlers registrados', () => {
      it('Então só destroy é chamado', async () => {
        const filial = umaFilial();
        filialModel.findOne.mockResolvedValue(filial);
        await service.excluir('T1', 'F1');
        expect(filial.destroy).toHaveBeenCalled();
      });
    });

    describe('Cenário: falha em um handler desfaz tudo', () => {
      it('Então o erro propaga, panfletos e destroy não rodam e nada é emitido', async () => {
        const filial = umaFilial();
        filialModel.findOne.mockResolvedValue(filial);
        registrar('produtos', 10);
        registrar('categorias', 20, async () => {
          throw new Error('falhou');
        });
        const panfletos = registrar('panfletos', 30);

        await expect(service.excluir('T1', 'F1')).rejects.toThrow('falhou');
        expect(panfletos.excluirPorFilial).not.toHaveBeenCalled();
        expect(filial.destroy).not.toHaveBeenCalled();
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: excluir filial inexistente ou de outro tenant', () => {
      it('Então RECURSO_NAO_ENCONTRADO e nenhum handler roda', async () => {
        filialModel.findOne.mockResolvedValue(null);
        const produtos = registrar('produtos', 10);
        await expect(service.excluir('T1', 'F9')).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
        expect(produtos.excluirPorFilial).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: exclusão toma lock da filial', () => {
      it('Então findOne usa lock UPDATE na transação', async () => {
        filialModel.findOne.mockResolvedValue(umaFilial());
        await service.excluir('T1', 'F1');
        expect(filialModel.findOne).toHaveBeenCalledWith(
          expect.objectContaining({ transaction: t, lock: 'UPDATE' }),
        );
      });
    });
  });
});
