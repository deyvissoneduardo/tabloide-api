import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/sequelize';
import { Test } from '@nestjs/testing';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { sequelizeFake, transacaoFake } from '../../../../test/helpers/transacao-fake';
import { ClockService } from '../../../common/clock/clock.service';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { naoEncontrado } from '../../../common/errors/errors';
import { VERIFICADOR_LIMITES } from '../../../common/limites/verificador-limites';
import { AuditoriaService, CAMPOS_AUDITADOS } from '../../auditoria/services/auditoria.service';
import { Categoria } from '../../categorias/models/categoria.model';
import { CategoriasService } from '../../categorias/services/categorias.service';
import { FiliaisService } from '../../filiais/services/filiais.service';
import { MidiaService } from '../../midia/services/midia.service';
import { VigenciaService } from '../../vigencia/services/vigencia.service';
import type { CriarProdutoDto } from '../dtos/criar-produto.dto';
import type { EditarProdutoDto } from '../dtos/editar-produto.dto';
import { Produto } from '../models/produto.model';
import { ProdutosService } from '../services/produtos.service';

const EVENTO = 'filial.conteudo-alterado';
const IMAGEM = { conteudo: Buffer.from('w'), largura: 800, altura: 800, contentType: 'image/webp', bytes: 1 };
const C1 = { id: 'c1', nome: 'Mercearia' };
const C2 = { id: 'c2', nome: 'Bebidas' };

/** Situações dos exemplos com hoje = 2026-10-18 (seção 12 do plano). */
const ROTULOS = {
  'P-vigente': { dataInicio: '2026-10-10', dataLimite: '2026-10-25' },
  'P-vigente-sem-limite': { dataInicio: '2026-10-01', dataLimite: null },
  'P-vigente-ultimo-dia': { dataInicio: '2026-10-10', dataLimite: '2026-10-18' },
  'P-agendado': { dataInicio: '2026-10-20', dataLimite: '2026-10-30' },
  'P-vencido': { dataInicio: '2026-10-01', dataLimite: '2026-10-17' },
  'P-excluido': {
    dataInicio: '2026-10-10',
    dataLimite: '2026-10-25',
    deletedAt: new Date('2026-10-15T12:00:00Z'),
  },
} as const;
type Rotulo = keyof typeof ROTULOS;

/** Produto falso com update e destroy observáveis, como uma instância do Sequelize. */
function umProduto(dados: Record<string, unknown> = {}) {
  const produto: Record<string, unknown> = {
    id: 'p1',
    tenantId: 't1',
    filialId: 'f1',
    categoriaId: 'c1',
    nome: 'Arroz',
    quantidade: null,
    precoPromocionalCentavos: 2199,
    precoOriginalCentavos: 2649,
    descricao: null,
    observacao: null,
    fotoPath: null,
    createdAt: new Date('2026-10-10T12:00:00Z'),
    updatedAt: new Date('2026-10-10T12:00:00Z'),
    deletedAt: null,
    ...ROTULOS['P-vigente'],
    ...dados,
  };
  produto.update = jest.fn(async (v: object) => Object.assign(produto, v));
  produto.destroy = jest.fn(async () => undefined);
  return produto as unknown as Produto & { update: jest.Mock; destroy: jest.Mock };
}

describe('Funcionalidade: ProdutosService', () => {
  let service: ProdutosService;
  let t: ReturnType<typeof transacaoFake>;
  let sequelize: ReturnType<typeof sequelizeFake>;
  let agora: Date;
  const produtoModel = { findOne: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn() };
  const categoriaModel = { findOne: jest.fn() };
  const filiais = { obter: jest.fn() };
  const categorias = { obterDaFilial: jest.fn() };
  const midia = { processar: jest.fn(), salvar: jest.fn(), urlPublica: jest.fn() };
  const auditoria = { registrarCriacao: jest.fn(), registrarAlteracoes: jest.fn() };
  const limites = { verificarCriacaoProduto: jest.fn() };
  const eventos = { emit: jest.fn() };
  const clock = { agora: jest.fn(() => agora) };
  let avisos: jest.SpyInstance;

  beforeEach(async () => {
    jest.resetAllMocks();
    agora = new Date('2026-10-18T15:00:00Z');
    clock.agora.mockImplementation(() => agora);
    t = transacaoFake();
    sequelize = sequelizeFake(t);
    filiais.obter.mockResolvedValue({ id: 'f1', tenantId: 't1', fusoHorario: 'America/Sao_Paulo' });
    categorias.obterDaFilial.mockImplementation(async (_t, _f, id: string) => (id === 'c2' ? C2 : C1));
    categoriaModel.findOne.mockResolvedValue(C1);
    midia.processar.mockResolvedValue(IMAGEM);
    midia.salvar.mockResolvedValue('t1/produto/novo.webp');
    midia.urlPublica.mockImplementation((c: string | null) => (c === null ? null : `https://cdn/${c}`));
    produtoModel.create.mockImplementation(async (v) =>
      umProduto({ ...v, createdAt: agora, updatedAt: agora }),
    );
    avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const modulo = await Test.createTestingModule({
      providers: [
        ProdutosService,
        VigenciaService,
        { provide: getModelToken(Produto), useValue: produtoModel },
        { provide: getModelToken(Categoria), useValue: categoriaModel },
        { provide: Sequelize, useValue: sequelize },
        { provide: FiliaisService, useValue: filiais },
        { provide: CategoriasService, useValue: categorias },
        { provide: MidiaService, useValue: midia },
        { provide: AuditoriaService, useValue: auditoria },
        { provide: VERIFICADOR_LIMITES, useValue: limites },
        { provide: EventEmitter2, useValue: eventos },
        { provide: ClockService, useValue: clock },
      ],
    }).compile();
    service = modulo.get(ProdutosService);
  });
  afterEach(() => avisos.mockRestore());

  describe('Funcionalidade: Cadastrar produto', () => {
    const criar = (dto: Partial<CriarProdutoDto> = {}, foto?: Buffer) =>
      service.criar(
        't1',
        'f1',
        { nome: 'Leite', categoriaId: 'c1', precoPromocionalCentavos: 499, ...dto } as CriarProdutoDto,
        foto,
      );
    const criado = () => produtoModel.create.mock.calls[0]![0];

    describe('Cenário: cadastro mínimo', () => {
      it('Então começa hoje (RN40), sem limite nem foto, no tenant e filial certos, e VIGENTE', async () => {
        const view = await criar();
        expect(criado()).toMatchObject({
          tenantId: 't1',
          filialId: 'f1',
          categoriaId: 'c1',
          dataInicio: '2026-10-18',
          dataLimite: null,
          fotoPath: null,
          precoOriginalCentavos: null,
          quantidade: null,
        });
        expect(produtoModel.create.mock.calls[0]![1]).toEqual({ transaction: t });
        expect(view).toMatchObject({ situacao: 'VIGENTE', urlFoto: null, categoria: C1 });
        expect(midia.processar).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: cadastro completo com foto', () => {
      it('Então processa e salva a foto antes da transação e grava o caminho', async () => {
        const foto = Buffer.from('jpeg');
        const view = await criar(
          { quantidade: '5kg', precoOriginalCentavos: 599, descricao: 'd', observacao: 'o' },
          foto,
        );
        expect(midia.processar).toHaveBeenCalledWith('t1', foto, 'produto');
        expect(midia.salvar).toHaveBeenCalledWith('t1', 'produto', IMAGEM);
        expect(criado()).toMatchObject({
          fotoPath: 't1/produto/novo.webp',
          quantidade: '5kg',
          descricao: 'd',
        });
        expect(midia.salvar.mock.invocationCallOrder[0]).toBeLessThan(
          sequelize.transaction.mock.invocationCallOrder[0]!,
        );
        expect(view.urlFoto).toBe('https://cdn/t1/produto/novo.webp');
      });
    });

    describe('Cenário: agendamento', () => {
      it('Então grava as datas e a situação é AGENDADO', async () => {
        const view = await criar({ dataInicio: '2026-10-20' as never, dataLimite: '2026-10-30' as never });
        expect(criado()).toMatchObject({ dataInicio: '2026-10-20', dataLimite: '2026-10-30' });
        expect(view).toMatchObject({ situacao: 'AGENDADO', dataInicioEditavel: true });
      });
    });

    describe('Cenário: preço original inválido', () => {
      it('Então PRECO_ORIGINAL_INVALIDO sem processar imagem nem criar', async () => {
        await expect(
          criar({ precoPromocionalCentavos: 1000, precoOriginalCentavos: 900 }, Buffer.from('x')),
        ).rejects.toMatchObject({ codigo: CodigoErro.PRECO_ORIGINAL_INVALIDO, status: 422 });
        expect(midia.processar).not.toHaveBeenCalled();
        expect(produtoModel.create).not.toHaveBeenCalled();
      });
    });

    describe.each([
      [
        'data limite antes do início',
        { dataInicio: '2026-10-20', dataLimite: '2026-10-19' },
        'DATA_LIMITE_INVALIDA',
      ],
      ['data limite no passado', { dataLimite: '2026-10-17' }, 'DATA_LIMITE_INVALIDA'],
      ['data de início no passado (D5 da Fase 2)', { dataInicio: '2026-10-17' }, 'DATA_INICIO_INVALIDA'],
    ])('Cenário: %s', (_nome, datas, codigo) => {
      it(`Então ${codigo} sem processar imagem`, async () => {
        await expect(criar(datas as never, Buffer.from('x'))).rejects.toMatchObject({ codigo, status: 422 });
        expect(midia.processar).not.toHaveBeenCalled();
        expect(produtoModel.create).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: data de início no passado aponta o campo', () => {
      it('Então detalhes.campo é dataInicio', async () =>
        expect(criar({ dataInicio: '2026-10-17' as never })).rejects.toMatchObject({
          detalhes: { campo: 'dataInicio' },
        }));
    });

    describe('Cenário: data limite hoje', () => {
      it('Então é criado e está VIGENTE', async () =>
        expect((await criar({ dataLimite: '2026-10-18' as never })).situacao).toBe('VIGENTE'));
    });

    describe('Cenário: categoria de outra filial, de outro tenant ou excluída', () => {
      it('Então RECURSO_NAO_ENCONTRADO e nada é criado', async () => {
        categorias.obterDaFilial.mockRejectedValue(naoEncontrado());
        await expect(criar({ categoriaId: 'c9' })).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
        expect(categorias.obterDaFilial).toHaveBeenCalledWith('t1', 'f1', 'c9', expect.anything());
        expect(produtoModel.create).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: filial excluída ou de outro tenant', () => {
      it('Então RECURSO_NAO_ENCONTRADO sem processar imagem', async () => {
        filiais.obter.mockRejectedValue(naoEncontrado());
        await expect(criar({}, Buffer.from('x'))).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
        expect(midia.processar).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: categoria travada em modo compartilhado (D4.6)', () => {
      it('Então obterDaFilial recebe lock SHARE na transação', async () => {
        await criar();
        expect(categorias.obterDaFilial).toHaveBeenCalledWith('t1', 'f1', 'c1', {
          transaction: t,
          lock: 'SHARE',
        });
      });
    });

    describe('Cenário: falha no banco depois de salvar a foto (D3.4)', () => {
      it('Então loga o órfão, não apaga nada, propaga o erro e não emite', async () => {
        const erro = new Error('falhou');
        produtoModel.create.mockRejectedValue(erro);
        await expect(criar({}, Buffer.from('x'))).rejects.toBe(erro);
        expect(avisos).toHaveBeenCalledWith(
          expect.objectContaining({
            evento: 'midia.arquivo_orfao',
            caminho: 't1/produto/novo.webp',
            tenantId: 't1',
          }),
        );
        expect(Object.keys(midia)).toEqual(['processar', 'salvar', 'urlPublica']);
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: falha no banco sem foto', () => {
      it('Então não há log de órfão', async () => {
        produtoModel.create.mockRejectedValue(new Error('falhou'));
        await criar().catch(() => undefined);
        expect(avisos).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: imagem inválida', () => {
      it('Então IMAGEM_INVALIDA, sem salvar nem criar', async () => {
        midia.processar.mockRejectedValue(new AppError(CodigoErro.IMAGEM_INVALIDA));
        await expect(criar({}, Buffer.from('x'))).rejects.toMatchObject({
          codigo: CodigoErro.IMAGEM_INVALIDA,
        });
        expect(midia.salvar).not.toHaveBeenCalled();
        expect(produtoModel.create).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: gancho de limite consultado (RNF12)', () => {
      it('Então verificarCriacaoProduto(t1, f1) roda na transação antes do create', async () => {
        await criar();
        expect(limites.verificarCriacaoProduto).toHaveBeenCalledWith('t1', 'f1', { transaction: t });
        expect(limites.verificarCriacaoProduto.mock.invocationCallOrder[0]).toBeLessThan(
          produtoModel.create.mock.invocationCallOrder[0]!,
        );
      });
    });

    describe('Cenário: limite atingido com foto enviada', () => {
      it('Então LIMITE_DO_PLANO_ATINGIDO e a foto fica registrada como órfã', async () => {
        limites.verificarCriacaoProduto.mockRejectedValue(new AppError(CodigoErro.LIMITE_DO_PLANO_ATINGIDO));
        await expect(criar({}, Buffer.from('x'))).rejects.toMatchObject({
          codigo: CodigoErro.LIMITE_DO_PLANO_ATINGIDO,
        });
        expect(avisos).toHaveBeenCalledWith(expect.objectContaining({ evento: 'midia.arquivo_orfao' }));
      });
    });

    describe('Cenário: cadastro grava auditoria com valor anterior nulo (D4.11)', () => {
      it('Então registrarCriacao recebe preços e datas na mesma transação', async () => {
        await criar({ precoPromocionalCentavos: 499, precoOriginalCentavos: 599 });
        expect(auditoria.registrarCriacao).toHaveBeenCalledWith(
          't1',
          'PRODUTO',
          criado().id,
          {
            precoPromocionalCentavos: 499,
            precoOriginalCentavos: 599,
            dataInicio: '2026-10-18',
            dataLimite: null,
          },
          CAMPOS_AUDITADOS.PRODUTO,
          { transaction: t },
        );
      });
    });

    describe('Cenário: cadastro emite evento após o commit (D4.12)', () => {
      it('Então emite { tenantId, filialId } só no afterCommit', async () => {
        await criar();
        expect(t.afterCommit).toHaveBeenCalledTimes(1);
        expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1', filialId: 'f1' });
      });
    });
  });

  describe('Funcionalidade: Editar produto (RN26, RNF07)', () => {
    const editar = (atual: Record<string, unknown>, dto: Record<string, unknown>) => {
      const produto = umProduto(atual);
      produtoModel.findOne.mockResolvedValue(produto);
      return { produto, resultado: service.editar('t1', 'f1', 'p1', dto as EditarProdutoDto) };
    };

    describe.each<[Rotulo, boolean]>([
      ['P-vigente', true],
      ['P-vigente-sem-limite', true],
      ['P-agendado', true],
      ['P-vencido', false],
      ['P-excluido', false],
    ])('Esquema do Cenário: edição de %s', (rotulo, editavel) => {
      it(editavel ? 'Então o produto é atualizado' : 'Então ITEM_NAO_EDITAVEL', async () => {
        const { produto, resultado } = editar(ROTULOS[rotulo], { nome: 'Novo nome' });
        if (editavel) {
          await resultado;
          expect(produto.update).toHaveBeenCalledWith({ nome: 'Novo nome' }, { transaction: t });
        } else {
          await expect(resultado).rejects.toMatchObject({
            codigo: CodigoErro.ITEM_NAO_EDITAVEL,
            status: 409,
          });
          expect(produto.update).not.toHaveBeenCalled();
        }
      });
    });

    describe('Cenário: alterar preço de vigente gera auditoria', () => {
      it('Então update, registrarAlteracoes e evento após o commit', async () => {
        const { produto, resultado } = editar({}, { precoPromocionalCentavos: 1999 });
        await resultado;
        expect(produto.update).toHaveBeenCalledWith({ precoPromocionalCentavos: 1999 }, { transaction: t });
        expect(auditoria.registrarAlteracoes).toHaveBeenCalledWith(
          't1',
          'PRODUTO',
          'p1',
          expect.objectContaining({ precoPromocionalCentavos: 2199 }),
          { precoPromocionalCentavos: 1999 },
          CAMPOS_AUDITADOS.PRODUTO,
          { transaction: t },
        );
        expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1', filialId: 'f1' });
      });
    });

    describe('Cenário: alterar só o nome não registra mudança auditada', () => {
      it('Então registrarAlteracoes recebe só o nome (nenhum campo auditado)', async () => {
        await editar({}, { nome: 'Outro' }).resultado;
        const [, , , , mudancas] = auditoria.registrarAlteracoes.mock.calls[0]!;
        expect(mudancas).toEqual({ nome: 'Outro' });
      });
    });

    describe('Cenário: edição sem mudança real', () => {
      it('Então não grava, não audita, não emite e devolve o atual', async () => {
        const { produto, resultado } = editar(
          {},
          { precoPromocionalCentavos: 2199, dataInicio: '2026-10-10' },
        );
        const view = await resultado;
        expect(produto.update).not.toHaveBeenCalled();
        expect(auditoria.registrarAlteracoes).not.toHaveBeenCalled();
        expect(eventos.emit).not.toHaveBeenCalled();
        expect(view).toMatchObject({ precoPromocionalCentavos: 2199, categoria: C1 });
      });
    });

    describe.each([
      ['encurtar a data limite de vigente', {}, { dataLimite: '2026-10-20' }, { dataLimite: '2026-10-20' }],
      ['remover a data limite de vigente', {}, { dataLimite: null }, { dataLimite: null }],
      [
        'reenviar o mesmo início de vigente com preço novo',
        {},
        { dataInicio: '2026-10-10', precoPromocionalCentavos: 1999 },
        { precoPromocionalCentavos: 1999 },
      ],
      [
        'adiar início de agendado',
        ROTULOS['P-agendado'],
        { dataInicio: '2026-10-22' },
        { dataInicio: '2026-10-22' },
      ],
      [
        'subir os dois preços juntos',
        {},
        { precoPromocionalCentavos: 2700, precoOriginalCentavos: 3000 },
        { precoPromocionalCentavos: 2700, precoOriginalCentavos: 3000 },
      ],
      ['remover preço original', {}, { precoOriginalCentavos: null }, { precoOriginalCentavos: null }],
    ])('Cenário: %s', (_nome, atual, dto, mudancas) => {
      it('Então atualiza e audita exatamente as mudanças', async () => {
        const { produto, resultado } = editar(atual, dto);
        await resultado;
        expect(produto.update).toHaveBeenCalledWith(mudancas, { transaction: t });
        expect(auditoria.registrarAlteracoes.mock.calls[0]![4]).toEqual(mudancas);
      });
    });

    describe('Cenário: remover a data limite registra o valor anterior', () => {
      it('Então antes tem "2026-10-25"', async () => {
        await editar({}, { dataLimite: null }).resultado;
        expect(auditoria.registrarAlteracoes.mock.calls[0]![3]).toMatchObject({ dataLimite: '2026-10-25' });
      });
    });

    describe.each([
      ['data limite no passado', {}, { dataLimite: '2026-10-17' }, 'DATA_LIMITE_INVALIDA'],
      ['alterar início de vigente', {}, { dataInicio: '2026-10-12' }, 'DATA_INICIO_IMUTAVEL'],
      [
        'início de agendado no passado',
        ROTULOS['P-agendado'],
        { dataInicio: '2026-10-17' },
        'DATA_INICIO_INVALIDA',
      ],
      [
        'início de agendado depois do limite atual',
        ROTULOS['P-agendado'],
        { dataInicio: '2026-11-02' },
        'DATA_LIMITE_INVALIDA',
      ],
      [
        'RN21 com valores resultantes (só original)',
        {},
        { precoOriginalCentavos: 2000 },
        'PRECO_ORIGINAL_INVALIDO',
      ],
      [
        'RN21 com valores resultantes (só promocional)',
        {},
        { precoPromocionalCentavos: 2700 },
        'PRECO_ORIGINAL_INVALIDO',
      ],
    ])('Cenário: %s', (_nome, atual, dto, codigo) => {
      it(`Então ${codigo}, sem gravar nem emitir`, async () => {
        const { produto, resultado } = editar(atual, dto);
        await expect(resultado).rejects.toMatchObject({ codigo });
        expect(produto.update).not.toHaveBeenCalled();
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: trocar de categoria na mesma filial', () => {
      it('Então C2 é obtida com lock SHARE e a resposta traz C2', async () => {
        const { produto, resultado } = editar({}, { categoriaId: 'c2' });
        const view = await resultado;
        expect(categorias.obterDaFilial).toHaveBeenCalledWith('t1', 'f1', 'c2', {
          transaction: t,
          lock: 'SHARE',
        });
        expect(produto.update).toHaveBeenCalledWith({ categoriaId: 'c2' }, { transaction: t });
        expect(view.categoria).toEqual(C2);
      });
    });

    describe('Cenário: mesma categoria não é reconsultada', () => {
      it('Então obterDaFilial não é chamado', async () => {
        await editar({}, { categoriaId: 'c1', nome: 'X' }).resultado;
        expect(categorias.obterDaFilial).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: trocar para categoria de outra filial ou excluída', () => {
      it('Então RECURSO_NAO_ENCONTRADO e update não é chamado', async () => {
        categorias.obterDaFilial.mockRejectedValue(naoEncontrado());
        const { produto, resultado } = editar({}, { categoriaId: 'c9' });
        await expect(resultado).rejects.toMatchObject({ codigo: CodigoErro.RECURSO_NAO_ENCONTRADO });
        expect(produto.update).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: produto de outra filial ou de outro tenant', () => {
      it('Então RECURSO_NAO_ENCONTRADO, com a busca travada, sem paranoid e restrita', async () => {
        produtoModel.findOne.mockResolvedValue(null);
        await expect(
          service.editar('t1', 'f1', 'p1', { nome: 'X' } as EditarProdutoDto),
        ).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
        expect(produtoModel.findOne).toHaveBeenCalledWith({
          where: { id: 'p1', tenantId: 't1', filialId: 'f1' },
          paranoid: false,
          transaction: t,
          lock: 'UPDATE',
        });
      });
    });

    describe('Cenário: falha ao auditar desfaz a edição', () => {
      it('Então o erro é propagado e nada é emitido', async () => {
        auditoria.registrarAlteracoes.mockRejectedValue(new Error('falhou'));
        await expect(editar({}, { precoPromocionalCentavos: 1999 }).resultado).rejects.toThrow('falhou');
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: produto vence à meia-noite no fuso da filial', () => {
      it('Então às 23:59:59 em São Paulo ainda edita', async () => {
        agora = new Date('2026-10-19T02:59:59Z');
        const { produto, resultado } = editar(ROTULOS['P-vigente-ultimo-dia'], { nome: 'X' });
        await resultado;
        expect(produto.update).toHaveBeenCalled();
      });

      it('Mas à 00:00 já é ITEM_NAO_EDITAVEL', async () => {
        agora = new Date('2026-10-19T03:00:00Z');
        await expect(editar(ROTULOS['P-vigente-ultimo-dia'], { nome: 'X' }).resultado).rejects.toMatchObject({
          codigo: CodigoErro.ITEM_NAO_EDITAVEL,
        });
      });
    });
  });

  describe('Funcionalidade: Listar e obter produtos', () => {
    const listar = (query: Record<string, unknown> = {}) =>
      service.listar('t1', 'f1', { pagina: 1, porPagina: 50, ...query } as never);
    const opcoes = () => produtoModel.findAndCountAll.mock.calls[0]![0];

    beforeEach(() => produtoModel.findAndCountAll.mockResolvedValue({ rows: [], count: 0 }));

    describe('Cenário: lista padrão exclui os excluídos', () => {
      it('Então paranoid ativo, ordem por nomeNormalizado e id, com a categoria incluída mesmo excluída', async () => {
        await listar();
        expect(opcoes()).toMatchObject({
          where: { tenantId: 't1', filialId: 'f1' },
          paranoid: true,
          order: [
            ['nomeNormalizado', 'ASC'],
            ['id', 'ASC'],
          ],
          include: [{ model: Categoria, attributes: ['id', 'nome'], paranoid: false }],
        });
      });
    });

    describe.each([
      [
        'VIGENTE',
        (w: Record<string | symbol, unknown>) => expect(w.dataInicio).toEqual({ [Op.lte]: '2026-10-18' }),
      ],
      [
        'AGENDADO',
        (w: Record<string | symbol, unknown>) => expect(w.dataInicio).toEqual({ [Op.gt]: '2026-10-18' }),
      ],
      [
        'VENCIDO',
        (w: Record<string | symbol, unknown>) => expect(w.dataLimite).toEqual({ [Op.lt]: '2026-10-18' }),
      ],
      ['EXCLUIDO', (w: Record<string | symbol, unknown>) => expect(w.deletedAt).toEqual({ [Op.ne]: null })],
    ])('Esquema do Cenário: filtro por situação %s', (situacao, conferir) => {
      it('Então o where contém a condição de vigência', async () => {
        await listar({ situacao: [situacao] });
        conferir(opcoes().where);
        expect(opcoes().paranoid).toBe(situacao !== 'EXCLUIDO');
      });
    });

    describe('Cenário: busca sem acento e com curinga escapado', () => {
      it('Então LIKE "%acucar 100\\%%"', async () => {
        await listar({ busca: 'Açúcar 100%' });
        expect(opcoes().where.nomeNormalizado).toEqual({ [Op.like]: '%acucar 100\\%%' });
      });
    });

    describe('Cenário: filtro por categoria', () => {
      it('Então o where contém categoriaId, tenantId e filialId', async () => {
        await listar({ categoriaId: 'c1' });
        expect(opcoes().where).toMatchObject({ categoriaId: 'c1', tenantId: 't1', filialId: 'f1' });
      });
    });

    describe('Cenário: paginação', () => {
      it('Então limit 20 e offset 40, com total, pagina e porPagina', async () => {
        produtoModel.findAndCountAll.mockResolvedValue({
          rows: [
            umProduto({ categoria: C1 }),
            umProduto({ id: 'p2', categoria: C1, ...ROTULOS['P-agendado'] }),
          ],
          count: 42,
        });
        const pagina = await listar({ pagina: 3, porPagina: 20 });
        expect(opcoes()).toMatchObject({ limit: 20, offset: 40 });
        expect(pagina).toMatchObject({ total: 42, pagina: 3, porPagina: 20 });
        expect(pagina.itens.map((p) => p.situacao)).toEqual(['VIGENTE', 'AGENDADO']);
        expect(clock.agora).toHaveBeenCalledTimes(1);
      });
    });

    describe('Cenário: obter produto excluído para consulta', () => {
      it('Então EXCLUIDO, não editável e com excluidoEm', async () => {
        produtoModel.findOne.mockResolvedValue(umProduto({ ...ROTULOS['P-excluido'], categoria: C1 }));
        const view = await service.obter('t1', 'f1', 'p1');
        expect(produtoModel.findOne).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'p1', tenantId: 't1', filialId: 'f1' }, paranoid: false }),
        );
        expect(view).toMatchObject({
          situacao: 'EXCLUIDO',
          editavel: false,
          excluidoEm: '2026-10-15T12:00:00.000Z',
        });
      });
    });

    describe('Cenário: obter produto inexistente', () => {
      it('Então RECURSO_NAO_ENCONTRADO', async () => {
        produtoModel.findOne.mockResolvedValue(null);
        await expect(service.obter('t1', 'f1', 'p1')).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
      });
    });
  });

  describe('Funcionalidade: Excluir produto', () => {
    describe.each<[Rotulo, boolean]>([
      ['P-vigente', true],
      ['P-agendado', true],
      ['P-vencido', true],
      ['P-excluido', false],
    ])('Esquema do Cenário: exclusão lógica de %s', (rotulo, permitido) => {
      it(permitido ? 'Então destroy é chamado' : 'Então ITEM_NAO_EDITAVEL', async () => {
        const produto = umProduto(ROTULOS[rotulo]);
        produtoModel.findOne.mockResolvedValue(produto);
        const resultado = service.excluir('t1', 'f1', 'p1');
        if (permitido) {
          await resultado;
          expect(produto.destroy).toHaveBeenCalledWith({ transaction: t });
        } else {
          await expect(resultado).rejects.toMatchObject({ codigo: CodigoErro.ITEM_NAO_EDITAVEL });
          expect(produto.destroy).not.toHaveBeenCalled();
        }
      });
    });

    describe('Cenário: exclusão não gera auditoria e emite após o commit', () => {
      it('Então registrarAlteracoes não é chamado e o evento sai', async () => {
        produtoModel.findOne.mockResolvedValue(umProduto());
        await service.excluir('t1', 'f1', 'p1');
        expect(auditoria.registrarAlteracoes).not.toHaveBeenCalled();
        expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1', filialId: 'f1' });
      });
    });

    describe('Cenário: produto inexistente', () => {
      it('Então RECURSO_NAO_ENCONTRADO', async () => {
        produtoModel.findOne.mockResolvedValue(null);
        await expect(service.excluir('t1', 'f1', 'p1')).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
      });
    });
  });

  describe('Funcionalidade: View com categoria', () => {
    describe('Cenário: categoria do produto não encontrada', () => {
      it('Então RECURSO_NAO_ENCONTRADO', async () => {
        categoriaModel.findOne.mockResolvedValue(null);
        await expect(service.paraView(umProduto(), '2026-10-18' as never)).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
      });
    });
  });
});
