import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/sequelize';
import { Test } from '@nestjs/testing';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { sequelizeFake, transacaoFake } from '../../../../test/helpers/transacao-fake';
import { ClockService } from '../../../common/clock/clock.service';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { naoEncontrado } from '../../../common/errors/errors';
import { Categoria } from '../../categorias/models/categoria.model';
import { FiliaisService } from '../../filiais/services/filiais.service';
import { MidiaService } from '../../midia/services/midia.service';
import { Produto } from '../../produtos/models/produto.model';
import { VigenciaService } from '../../vigencia/services/vigencia.service';
import { EstruturaService } from '../services/estrutura.service';

const EVENTO = 'filial.conteudo-alterado';
const C1 = '0192f3a0-0000-7000-8000-0000000000c1';
const C2 = '0192f3a0-0000-7000-8000-0000000000c2';
const P1 = '0192f3a0-0000-7000-8000-0000000000a1';
const P2 = '0192f3a0-0000-7000-8000-0000000000a2';

const produto = (dados: Record<string, unknown> = {}) => ({
  id: P1,
  categoriaId: C1,
  nome: 'Arroz',
  quantidade: null,
  descricao: null,
  observacao: null,
  precoPromocionalCentavos: 1000,
  precoOriginalCentavos: null,
  fotoPath: null,
  dataInicio: '2026-10-01',
  dataLimite: null,
  posicao: null,
  ...dados,
});

describe('Funcionalidade: EstruturaService', () => {
  let service: EstruturaService;
  let t: ReturnType<typeof transacaoFake>;
  let sequelize: ReturnType<typeof sequelizeFake> & { query: jest.Mock };
  const categoriaModel = { findAll: jest.fn() };
  const produtoModel = { findAll: jest.fn() };
  const filiais = { obter: jest.fn() };
  const midia = { urlPublica: jest.fn() };
  const eventos = { emit: jest.fn() };
  const clock = { agora: jest.fn() };
  const filialSp = { id: 'f1', tenantId: 't1', fusoHorario: 'America/Sao_Paulo' };

  beforeEach(async () => {
    jest.resetAllMocks();
    clock.agora.mockReturnValue(new Date('2026-10-26T15:00:00Z'));
    t = transacaoFake();
    sequelize = { ...sequelizeFake(t), query: jest.fn().mockResolvedValue([[], 0]) };
    filiais.obter.mockResolvedValue(filialSp);
    categoriaModel.findAll.mockResolvedValue([]);
    produtoModel.findAll.mockResolvedValue([]);
    midia.urlPublica.mockImplementation((c: string | null) => (c ? `https://cdn/${c}` : null));

    const modulo = await Test.createTestingModule({
      providers: [
        EstruturaService,
        VigenciaService,
        { provide: getModelToken(Categoria), useValue: categoriaModel },
        { provide: getModelToken(Produto), useValue: produtoModel },
        { provide: Sequelize, useValue: sequelize },
        { provide: FiliaisService, useValue: filiais },
        { provide: MidiaService, useValue: midia },
        { provide: EventEmitter2, useValue: eventos },
        { provide: ClockService, useValue: clock },
      ],
    }).compile();
    service = modulo.get(EstruturaService);
  });

  describe('Funcionalidade: Leitura da estrutura', () => {
    describe('Cenário: filial de outro tenant', () => {
      it('Então RECURSO_NAO_ENCONTRADO', async () => {
        filiais.obter.mockRejectedValue(naoEncontrado());
        await expect(service.obter('t1', 'f9')).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
        expect(filiais.obter).toHaveBeenCalledWith('t1', 'f9', { transaction: undefined });
      });
    });

    describe('Cenário: lista todas as categorias, inclusive sem produtos', () => {
      it('Então a categoria vazia aparece com produtos []', async () => {
        categoriaModel.findAll.mockResolvedValue([{ id: C1, nome: 'Vazia', posicao: null }]);
        await expect(service.obter('t1', 'f1')).resolves.toEqual({
          categorias: [{ id: C1, nome: 'Vazia', produtos: [] }],
        });
        expect(categoriaModel.findAll.mock.calls[0]![0]).toMatchObject({
          where: { tenantId: 't1', filialId: 'f1' },
          attributes: ['id', 'nome', 'posicao'],
        });
      });
    });

    describe('Cenário: lista só produtos vigentes e agendados', () => {
      it('Então a consulta usa filtroSituacao com VIGENTE e AGENDADO, no hoje da filial', async () => {
        await service.obter('t1', 'f1');
        const opcoes = produtoModel.findAll.mock.calls[0]![0];
        expect(opcoes.where).toMatchObject({ tenantId: 't1', filialId: 'f1' });
        expect(opcoes.where[Op.or]).toEqual([
          {
            dataInicio: { [Op.lte]: '2026-10-26' },
            [Op.or]: [{ dataLimite: null }, { dataLimite: { [Op.gte]: '2026-10-26' } }],
          },
          { dataInicio: { [Op.gt]: '2026-10-26' } },
        ]);
        expect(opcoes.paranoid).toBe(true);
      });
    });

    describe('Cenário: ordena categorias e produtos por posição e depois por nome', () => {
      it('Então posicionados primeiro e os demais em ordem alfabética', async () => {
        categoriaModel.findAll.mockResolvedValue([
          { id: C1, nome: 'Açougue', posicao: null },
          { id: C2, nome: 'Bebidas', posicao: 0 },
        ]);
        produtoModel.findAll.mockResolvedValue([
          produto({ id: P1, nome: 'Arroz' }),
          produto({ id: P2, nome: 'Feijão', posicao: 0 }),
          produto({ id: 'p3', nome: 'Água', categoriaId: C2 }),
        ]);
        const view = await service.obter('t1', 'f1');
        expect(view.categorias.map((c) => c.nome)).toEqual(['Bebidas', 'Açougue']);
        expect(view.categorias[1]!.produtos.map((p) => p.nome)).toEqual(['Feijão', 'Arroz']);
        expect(view.categorias[0]!.produtos.map((p) => p.nome)).toEqual(['Água']);
      });
    });

    describe('Cenário: urlFoto vem do MidiaService', () => {
      it('Então com foto vira URL e sem foto é null', async () => {
        categoriaModel.findAll.mockResolvedValue([{ id: C1, nome: 'X', posicao: null }]);
        produtoModel.findAll.mockResolvedValue([
          produto({ id: P1, nome: 'A', fotoPath: 't1/produto/a.webp' }),
          produto({ id: P2, nome: 'B' }),
        ]);
        const [a, b] = (await service.obter('t1', 'f1')).categorias[0]!.produtos;
        expect(a!.urlFoto).toBe('https://cdn/t1/produto/a.webp');
        expect(b!.urlFoto).toBeNull();
      });
    });
  });

  describe('Funcionalidade: Gravação da estrutura (RN45)', () => {
    const existentes = () => {
      categoriaModel.findAll.mockResolvedValue([{ id: C1 }, { id: C2 }]);
      produtoModel.findAll.mockResolvedValue([
        { id: P1, categoriaId: C1 },
        { id: P2, categoriaId: C1 },
      ]);
    };
    const sqls = () => sequelize.query.mock.calls.map((c) => String(c[0]));

    describe('Cenário: grava as posições numa transação com lock na filial', () => {
      it('Então trava a filial e executa os 4 UPDATE com tenantId e filialId', async () => {
        existentes();
        await service.salvar('t1', 'f1', {
          categorias: [
            { id: C2, produtos: [] },
            { id: C1, produtos: [P2, P1] },
          ],
        });
        expect(filiais.obter).toHaveBeenCalledWith('t1', 'f1', { transaction: t, lock: 'UPDATE' });
        expect(sequelize.query).toHaveBeenCalledTimes(4);
        for (const [, opcoes] of sequelize.query.mock.calls) {
          expect(opcoes.replacements).toMatchObject({ tenantId: 't1', filialId: 'f1' });
          expect(opcoes.transaction).toBe(t);
        }
        expect(sqls()[0]).toContain('UPDATE categorias SET posicao = NULL');
        expect(sqls()[1]).toContain('UPDATE produtos SET posicao = NULL');
        expect(sqls()[2]).toContain('UPDATE categorias AS t SET posicao = v.posicao');
        expect(sequelize.query.mock.calls[2]![1].replacements).toMatchObject({
          id0: C2,
          posicao0: 0,
          id1: C1,
          posicao1: 1,
        });
        expect(sequelize.query.mock.calls[3]![1].replacements).toMatchObject({
          id0: P2,
          posicao0: 0,
          id1: P1,
          posicao1: 1,
        });
      });

      it('E os ids nunca são concatenados no SQL e nenhum UPDATE altera updated_at', async () => {
        existentes();
        await service.salvar('t1', 'f1', { categorias: [{ id: C1, produtos: [P1] }] });
        for (const sql of sqls()) {
          expect(sql).not.toContain(C1);
          expect(sql).not.toContain(P1);
          expect(sql).not.toContain('updated_at');
          expect(sql).toContain('tenant_id = :tenantId');
          expect(sql).toContain('filial_id = :filialId');
        }
      });
    });

    describe('Cenário: corpo vazio limpa as posições', () => {
      it('Então só os 2 UPDATE de limpeza são executados', async () => {
        existentes();
        await service.salvar('t1', 'f1', { categorias: [] });
        expect(sqls()).toHaveLength(2);
        expect(sqls().every((sql) => sql.includes('SET posicao = NULL'))).toBe(true);
      });
    });

    describe('Cenário: problema de validação', () => {
      it('Então ESTRUTURA_INVALIDA com detalhes.problemas e nenhum UPDATE', async () => {
        existentes();
        await expect(
          service.salvar('t1', 'f1', { categorias: [{ id: 'outra', produtos: [] }] }),
        ).rejects.toMatchObject({
          codigo: CodigoErro.ESTRUTURA_INVALIDA,
          status: 422,
          detalhes: { problemas: [{ tipo: 'CATEGORIA_DESCONHECIDA', id: 'outra' }] },
        });
        expect(sequelize.query).not.toHaveBeenCalled();
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: os itens existentes são lidos do tenant e da filial', () => {
      it('Então as duas consultas filtram por tenantId e filialId', async () => {
        existentes();
        await service.salvar('t1', 'f1', { categorias: [] });
        expect(categoriaModel.findAll.mock.calls[0]![0].where).toEqual({ tenantId: 't1', filialId: 'f1' });
        expect(produtoModel.findAll.mock.calls[0]![0].where).toEqual({ tenantId: 't1', filialId: 'f1' });
      });
    });

    describe('Cenário: emite filial.conteudo-alterado após o commit', () => {
      it('Então o evento sai com tenantId e filialId', async () => {
        existentes();
        await service.salvar('t1', 'f1', { categorias: [] });
        expect(t.afterCommit).toHaveBeenCalled();
        expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1', filialId: 'f1' });
      });
    });

    describe('Cenário: falha no banco', () => {
      it('Então o erro sobe e o evento não é emitido', async () => {
        existentes();
        sequelize.query.mockRejectedValue(new Error('conexão perdida'));
        await expect(service.salvar('t1', 'f1', { categorias: [] })).rejects.toThrow('conexão perdida');
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: devolve a estrutura relida na mesma transação', () => {
      it('Então a releitura usa a transação', async () => {
        existentes();
        await service.salvar('t1', 'f1', { categorias: [] });
        expect(filiais.obter).toHaveBeenLastCalledWith('t1', 'f1', { transaction: t });
        expect(categoriaModel.findAll.mock.calls.at(-1)![0].transaction).toBe(t);
      });
    });
  });
});
