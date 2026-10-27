import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/sequelize';
import { Test } from '@nestjs/testing';
import { UniqueConstraintError } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { sequelizeFake, transacaoFake } from '../../../../test/helpers/transacao-fake';
import { ClockService } from '../../../common/clock/clock.service';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { naoEncontrado } from '../../../common/errors/errors';
import { FiliaisService } from '../../filiais/services/filiais.service';
import { Produto } from '../../produtos/models/produto.model';
import { VigenciaService } from '../../vigencia/services/vigencia.service';
import { Categoria } from '../models/categoria.model';
import { CategoriasService } from '../services/categorias.service';

const EVENTO = 'filial.conteudo-alterado';
const CRIADO = new Date('2026-10-18T13:02:11Z');

/** Categoria falsa com update e destroy observáveis, como uma instância do Sequelize. */
function umaCategoria(dados: Record<string, unknown> = {}) {
  const categoria: Record<string, unknown> = {
    id: 'c1',
    tenantId: 't1',
    filialId: 'f1',
    nome: 'Bebidas',
    createdAt: CRIADO,
    updatedAt: CRIADO,
    ...dados,
  };
  categoria.update = jest.fn(async (v: object) => Object.assign(categoria, v));
  categoria.destroy = jest.fn(async () => undefined);
  categoria.get = () => ({ ...categoria });
  return categoria as unknown as Categoria & { update: jest.Mock; destroy: jest.Mock };
}

const linha = (dados: Record<string, unknown> = {}) => ({
  id: 'c1',
  nome: 'Bebidas',
  vigentes: '0',
  agendados: '0',
  vencidos: '0',
  posicao: null,
  createdAt: CRIADO,
  updatedAt: CRIADO,
  ...dados,
});

describe('Funcionalidade: CategoriasService', () => {
  let service: CategoriasService;
  let t: ReturnType<typeof transacaoFake>;
  let sequelize: ReturnType<typeof sequelizeFake> & { query: jest.Mock };
  const categoriaModel = { create: jest.fn(), findOne: jest.fn() };
  const produtoModel = { destroy: jest.fn() };
  const filiais = { obter: jest.fn() };
  const eventos = { emit: jest.fn() };
  const clock = { agora: jest.fn() };
  const filialSp = { id: 'f1', tenantId: 't1', fusoHorario: 'America/Sao_Paulo' };

  beforeEach(async () => {
    jest.resetAllMocks();
    clock.agora.mockReturnValue(new Date('2026-10-18T15:00:00Z'));
    t = transacaoFake();
    sequelize = { ...sequelizeFake(t), query: jest.fn().mockResolvedValue([]) };
    filiais.obter.mockResolvedValue(filialSp);

    const modulo = await Test.createTestingModule({
      providers: [
        CategoriasService,
        VigenciaService,
        { provide: getModelToken(Categoria), useValue: categoriaModel },
        { provide: getModelToken(Produto), useValue: produtoModel },
        { provide: Sequelize, useValue: sequelize },
        { provide: FiliaisService, useValue: filiais },
        { provide: EventEmitter2, useValue: eventos },
        { provide: ClockService, useValue: clock },
      ],
    }).compile();
    service = modulo.get(CategoriasService);
  });

  const sqlDaConsulta = () => String(sequelize.query.mock.calls[0]![0]);
  const parametros = () => sequelize.query.mock.calls[0]![1].replacements;

  describe('Funcionalidade: Listar categorias da filial', () => {
    describe('Cenário: lista com contagens por situação', () => {
      it('Então "Bebidas" vem com 1/1/1 e podeExcluir falso', async () => {
        sequelize.query.mockResolvedValue([linha({ vigentes: '1', agendados: '1', vencidos: '1' })]);
        const [bebidas] = await service.listar('t1', 'f1');
        expect(bebidas).toEqual({
          id: 'c1',
          nome: 'Bebidas',
          produtos: { vigentes: 1, agendados: 1, vencidos: 1 },
          podeExcluir: false,
          criadoEm: '2026-10-18T13:02:11.000Z',
          atualizadoEm: '2026-10-18T13:02:11.000Z',
        });
      });

      it('E o produto excluído não é contado (o JOIN só pega deleted_at nulo)', async () => {
        await service.listar('t1', 'f1');
        expect(sqlDaConsulta()).toContain('p.deleted_at IS NULL');
      });
    });

    describe('Cenário: categoria só com vencidos pode ser excluída', () => {
      it('Então podeExcluir é verdadeiro', async () => {
        sequelize.query.mockResolvedValue([linha({ nome: 'Hortifrúti', vencidos: '4' })]);
        expect((await service.listar('t1', 'f1'))[0]!.podeExcluir).toBe(true);
      });
    });

    describe('Cenário: ordem alfabética pt-BR', () => {
      it('Então a consulta ordena por nome_normalizado e depois por id', async () => {
        await service.listar('t1', 'f1');
        expect(sqlDaConsulta()).toContain('ORDER BY c.nome_normalizado, c.id');
      });
    });

    describe('Cenário: listar segue a ordem por posição (RN45)', () => {
      it('Então as posicionadas vêm primeiro e as demais em ordem alfabética', async () => {
        sequelize.query.mockResolvedValue([
          linha({ id: 'c1', nome: 'Açougue' }),
          linha({ id: 'c2', nome: 'Bebidas', posicao: 1 }),
          linha({ id: 'c3', nome: 'Limpeza', posicao: 0 }),
        ]);
        expect((await service.listar('t1', 'f1')).map((c) => c.nome)).toEqual([
          'Limpeza',
          'Bebidas',
          'Açougue',
        ]);
        expect(sqlDaConsulta()).toContain('c.posicao');
      });

      it('E a view não expõe a posição', async () => {
        sequelize.query.mockResolvedValue([linha({ posicao: 2 })]);
        expect((await service.listar('t1', 'f1'))[0]).not.toHaveProperty('posicao');
      });
    });

    describe('Cenário: filial de outro tenant', () => {
      it('Então RECURSO_NAO_ENCONTRADO e nenhuma consulta de categoria', async () => {
        filiais.obter.mockRejectedValue(naoEncontrado());
        await expect(service.listar('t1', 'f2')).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
        expect(sequelize.query).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: a consulta sempre filtra por tenant', () => {
      it('Então o SQL tem tenant_id em categorias e em produtos, com T1 como parâmetro', async () => {
        await service.listar('t1', 'f1');
        expect(sqlDaConsulta()).toContain('c.tenant_id = :tenantId');
        expect(sqlDaConsulta()).toContain('p.tenant_id = :tenantId');
        expect(parametros()).toMatchObject({ tenantId: 't1', filialId: 'f1', categoriaId: null });
      });
    });

    describe('Cenário: "hoje" vem do fuso da filial', () => {
      it('Então 2026-10-19T03:30Z em Rio Branco ainda é 2026-10-18', async () => {
        clock.agora.mockReturnValue(new Date('2026-10-19T03:30:00Z'));
        filiais.obter.mockResolvedValue({ ...filialSp, fusoHorario: 'America/Rio_Branco' });
        await service.listar('t1', 'f1');
        expect(parametros().hoje).toBe('2026-10-18');
      });
    });
  });

  describe('Funcionalidade: Criar categoria', () => {
    describe('Cenário: criação válida', () => {
      it('Então create recebe tenant, filial e nome, e volta com contagens zeradas', async () => {
        categoriaModel.create.mockImplementation(async (v) => umaCategoria(v));
        const view = await service.criar('t1', 'f1', { nome: 'Mercearia' });
        expect(categoriaModel.create).toHaveBeenCalledWith(
          expect.objectContaining({ tenantId: 't1', filialId: 'f1', nome: 'Mercearia' }),
        );
        expect(view).toMatchObject({
          nome: 'Mercearia',
          produtos: { vigentes: 0, agendados: 0, vencidos: 0 },
          podeExcluir: true,
        });
        expect(sequelize.query).not.toHaveBeenCalled();
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: filial excluída', () => {
      it('Então RECURSO_NAO_ENCONTRADO', async () => {
        filiais.obter.mockRejectedValue(naoEncontrado());
        await expect(service.criar('t1', 'f1', { nome: 'X' })).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
        expect(categoriaModel.create).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: nome duplicado na mesma filial', () => {
      it('Então o UniqueConstraintError propaga para o filtro', async () => {
        const erro = new UniqueConstraintError({});
        categoriaModel.create.mockRejectedValue(erro);
        await expect(service.criar('t1', 'f1', { nome: 'bebidas' })).rejects.toBe(erro);
      });
    });
  });

  describe('Funcionalidade: Renomear categoria', () => {
    describe('Cenário: renomear com sucesso', () => {
      it('Então update recebe o nome novo e o evento sai após o commit', async () => {
        const categoria = umaCategoria();
        categoriaModel.findOne.mockResolvedValue(categoria);
        sequelize.query.mockResolvedValue([linha({ nome: 'Frios e Laticínios' })]);
        const view = await service.renomear('t1', 'f1', 'c1', { nome: 'Frios e Laticínios' });
        expect(categoria.update).toHaveBeenCalledWith({ nome: 'Frios e Laticínios' }, { transaction: t });
        expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1', filialId: 'f1' });
        expect(parametros().categoriaId).toBe('c1');
        expect(view.nome).toBe('Frios e Laticínios');
      });
    });

    describe('Cenário: mesmo nome', () => {
      it('Então update não é chamado, nem o evento', async () => {
        const categoria = umaCategoria();
        categoriaModel.findOne.mockResolvedValue(categoria);
        sequelize.query.mockResolvedValue([linha()]);
        await expect(service.renomear('t1', 'f1', 'c1', { nome: 'Bebidas' })).resolves.toMatchObject({
          nome: 'Bebidas',
        });
        expect(categoria.update).not.toHaveBeenCalled();
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: categoria de outra filial, de outro tenant ou excluída', () => {
      it('Então RECURSO_NAO_ENCONTRADO, com a busca restrita a id, tenant e filial', async () => {
        categoriaModel.findOne.mockResolvedValue(null);
        await expect(service.renomear('t1', 'f1', 'c9', { nome: 'X' })).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
        expect(categoriaModel.findOne).toHaveBeenCalledWith({
          where: { id: 'c9', tenantId: 't1', filialId: 'f1' },
          transaction: t,
        });
      });
    });

    describe('Cenário: categoria some entre o update e a releitura', () => {
      it('Então RECURSO_NAO_ENCONTRADO', async () => {
        categoriaModel.findOne.mockResolvedValue(umaCategoria());
        sequelize.query.mockResolvedValue([]);
        await expect(service.renomear('t1', 'f1', 'c1', { nome: 'Outro' })).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
      });
    });
  });

  describe('Funcionalidade: Excluir categoria (RN20)', () => {
    const excluir = (contagem: Record<string, string> | null) => {
      const categoria = umaCategoria();
      categoriaModel.findOne.mockResolvedValue(categoria);
      sequelize.query.mockResolvedValue(contagem ? [linha(contagem)] : []);
      return { categoria, resultado: service.excluir('t1', 'f1', 'c1') };
    };

    describe.each([
      ['categoria vazia', null],
      ['só produtos vencidos', { vencidos: '3' }],
      ['produtos já excluídos não bloqueiam', { vigentes: '0', agendados: '0' }],
    ])('Cenário: %s', (_nome, contagem) => {
      it('Então exclui os produtos e a categoria na mesma transação e emite após o commit', async () => {
        const { categoria, resultado } = excluir(contagem);
        await resultado;
        expect(produtoModel.destroy).toHaveBeenCalledWith({
          where: { tenantId: 't1', categoriaId: 'c1', filialId: 'f1' },
          transaction: t,
        });
        expect(categoria.destroy).toHaveBeenCalledWith({ transaction: t });
        expect(sequelize.query.mock.calls[0]![1]).toMatchObject({ transaction: t });
        expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1', filialId: 'f1' });
      });
    });

    describe.each([
      ['com produto vigente', { vigentes: '1', vencidos: '1' }, { vigentes: 1, agendados: 0 }],
      ['com produto agendado', { agendados: '1' }, { vigentes: 0, agendados: 1 }],
      ['produto no último dia de vigência ainda bloqueia', { vigentes: '1' }, { vigentes: 1, agendados: 0 }],
      ['mix completo', { vigentes: '2', agendados: '1', vencidos: '1' }, { vigentes: 2, agendados: 1 }],
    ])('Cenário: %s', (_nome, contagem, detalhes) => {
      it('Então CATEGORIA_COM_PRODUTOS_ATIVOS com as contagens e nenhum destroy', async () => {
        const { categoria, resultado } = excluir(contagem);
        await expect(resultado).rejects.toMatchObject({
          codigo: CodigoErro.CATEGORIA_COM_PRODUTOS_ATIVOS,
          status: 409,
          detalhes,
        });
        expect(produtoModel.destroy).not.toHaveBeenCalled();
        expect(categoria.destroy).not.toHaveBeenCalled();
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: as contagens usam as mesmas condições de calcularSituacao', () => {
      it('Então o último dia (data_limite = hoje) conta como vigente', async () => {
        await excluir(null).resultado;
        expect(sqlDaConsulta()).toContain('p.data_limite >= :hoje');
        expect(sqlDaConsulta()).toContain('p.data_limite < :hoje');
        expect(sqlDaConsulta()).toContain('p.data_inicio > :hoje');
      });
    });

    describe('Cenário: trava pessimista', () => {
      it('Então a filial é lida na transação e a categoria com lock UPDATE', async () => {
        await excluir(null).resultado;
        expect(filiais.obter).toHaveBeenCalledWith('t1', 'f1', { transaction: t });
        expect(categoriaModel.findOne).toHaveBeenCalledWith({
          where: { id: 'c1', tenantId: 't1', filialId: 'f1' },
          transaction: t,
          lock: 'UPDATE',
        });
      });
    });

    describe('Cenário: falha no meio desfaz tudo', () => {
      it('Então o erro é propagado e nada é emitido', async () => {
        const { categoria, resultado } = excluir({ vencidos: '2' });
        categoria.destroy.mockRejectedValue(new Error('falhou'));
        await expect(resultado).rejects.toThrow('falhou');
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: categoria inexistente ou de outro tenant', () => {
      it('Então RECURSO_NAO_ENCONTRADO', async () => {
        categoriaModel.findOne.mockResolvedValue(null);
        await expect(service.excluir('t1', 'f1', 'c1')).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
        expect(produtoModel.destroy).not.toHaveBeenCalled();
      });
    });
  });
});
