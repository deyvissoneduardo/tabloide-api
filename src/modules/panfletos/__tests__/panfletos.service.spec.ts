import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/sequelize';
import { Test } from '@nestjs/testing';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { sequelizeFake, transacaoFake } from '../../../../test/helpers/transacao-fake';
import { ClockService } from '../../../common/clock/clock.service';
import { AppError } from '../../../common/errors/app.error';
import type { DataISO } from '../../../common/utils/date-only';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { naoEncontrado } from '../../../common/errors/errors';
import { AuditoriaService, CAMPOS_AUDITADOS } from '../../auditoria/services/auditoria.service';
import { FiliaisService } from '../../filiais/services/filiais.service';
import { MidiaService } from '../../midia/services/midia.service';
import { VigenciaService } from '../../vigencia/services/vigencia.service';
import { Panfleto } from '../models/panfleto.model';
import { PanfletosService } from '../services/panfletos.service';

const EVENTO = 'filial.conteudo-alterado';
const IMAGEM = {
  conteudo: Buffer.from('w'),
  largura: 1697,
  altura: 2400,
  contentType: 'image/webp',
  bytes: 1,
};

/** Panfleto falso com update observável, como uma instância do Sequelize. */
function umPanfleto(dados: Record<string, unknown> = {}) {
  const panfleto: Record<string, unknown> = {
    id: 'p1',
    tenantId: 't1',
    filialId: 'f1',
    imagemPath: 't1/panfleto/antigo.webp',
    imagemLargura: 1000,
    imagemAltura: 1400,
    dataInicio: '2026-10-01',
    dataLimite: null,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    deletedAt: null,
    ...dados,
  };
  panfleto.update = jest.fn(async (valores: object) => Object.assign(panfleto, valores));
  panfleto.get = () => ({ ...panfleto });
  return panfleto as unknown as Panfleto & { update: jest.Mock };
}

describe('Funcionalidade: PanfletosService', () => {
  let service: PanfletosService;
  let t: ReturnType<typeof transacaoFake>;
  let sequelize: ReturnType<typeof sequelizeFake>;
  let agora: Date;
  const panfletoModel = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
    destroy: jest.fn(),
  };
  const filiais = { obter: jest.fn() };
  const midia = {
    processar: jest.fn(),
    salvar: jest.fn(),
    urlPublica: jest.fn((c: string) => `https://cdn/${c}`),
  };
  const auditoria = { registrarCriacao: jest.fn(), registrarAlteracoes: jest.fn() };
  const eventos = { emit: jest.fn() };
  const clock = { agora: jest.fn(() => agora) };
  let avisos: jest.SpyInstance;

  beforeEach(async () => {
    jest.resetAllMocks();
    agora = new Date('2026-10-18T15:00:00Z');
    clock.agora.mockImplementation(() => agora);
    t = transacaoFake();
    sequelize = sequelizeFake(t);
    midia.urlPublica.mockImplementation((c: string) => `https://cdn/${c}`);
    filiais.obter.mockResolvedValue({ id: 'f1', tenantId: 't1', fusoHorario: 'America/Sao_Paulo' });
    midia.processar.mockResolvedValue(IMAGEM);
    midia.salvar.mockResolvedValue('t1/panfleto/novo.webp');
    panfletoModel.findAll.mockResolvedValue([]);
    panfletoModel.create.mockImplementation(async (v) => ({ ...v, createdAt: agora, deletedAt: null }));
    avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const modulo = await Test.createTestingModule({
      providers: [
        PanfletosService,
        VigenciaService,
        { provide: getModelToken(Panfleto), useValue: panfletoModel },
        { provide: Sequelize, useValue: sequelize },
        { provide: FiliaisService, useValue: filiais },
        { provide: MidiaService, useValue: midia },
        { provide: AuditoriaService, useValue: auditoria },
        { provide: EventEmitter2, useValue: eventos },
        { provide: ClockService, useValue: clock },
      ],
    }).compile();
    service = modulo.get(PanfletosService);
  });
  afterEach(() => avisos.mockRestore());

  const criar = (dto: Record<string, string> = {}) => service.criar('t1', 'f1', dto, Buffer.from('img'));
  const existentes = (...lista: Array<[string, string, string | null]>) =>
    panfletoModel.findAll.mockResolvedValue(
      lista.map(([id, dataInicio, dataLimite]) => ({ id, dataInicio, dataLimite })),
    );

  describe('Funcionalidade: Criar panfleto', () => {
    describe('Cenário: sem datas vale a partir de hoje e sem limite (RN15, RN40)', () => {
      it('Então grava início hoje, sem limite, e responde VIGENTE e editável', async () => {
        const view = await criar();
        expect(panfletoModel.create).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: 't1',
            filialId: 'f1',
            dataInicio: '2026-10-18',
            dataLimite: null,
            imagemPath: 't1/panfleto/novo.webp',
            imagemLargura: 1697,
            imagemAltura: 2400,
          }),
          { transaction: t },
        );
        expect(view).toMatchObject({
          situacao: 'VIGENTE',
          editavel: true,
          largura: 1697,
          altura: 2400,
          urlImagem: 'https://cdn/t1/panfleto/novo.webp',
        });
        expect(view).not.toHaveProperty('imagemPath');
      });
    });

    describe('Cenário: agendado', () => {
      it('Então a situação é AGENDADO', async () =>
        expect((await criar({ dataInicio: '2026-11-01', dataLimite: '2026-11-15' })).situacao).toBe(
          'AGENDADO',
        ));
    });

    describe.each([
      ['2026-10-19T02:30:00Z', 'America/Sao_Paulo'],
      ['2026-10-19T03:30:00Z', 'America/Manaus'],
    ])('Cenário: hoje no fuso da filial (%s em %s)', (instante, fuso) => {
      it('Então dataInicio é 2026-10-18', async () => {
        agora = new Date(instante);
        filiais.obter.mockResolvedValue({ id: 'f1', fusoHorario: fuso });
        await criar();
        expect(panfletoModel.create.mock.calls[0]![0].dataInicio).toBe('2026-10-18');
      });
    });

    describe.each([
      [
        'data limite antes do início (RN42)',
        { dataInicio: '2026-11-10', dataLimite: '2026-11-01' },
        'DATA_LIMITE_INVALIDA',
      ],
      ['data limite no passado (RN42)', { dataLimite: '2026-10-17' }, 'DATA_LIMITE_INVALIDA'],
      ['data de início no passado (D5)', { dataInicio: '2026-10-17' }, 'DATA_INICIO_INVALIDA'],
    ])('Cenário: %s', (_nome, dto, codigo) => {
      it(`Então ${codigo}, sem storage nem create`, async () => {
        await expect(criar(dto)).rejects.toMatchObject({ codigo, status: 422 });
        expect(midia.salvar).not.toHaveBeenCalled();
        expect(panfletoModel.create).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: data limite hoje é válida', () => {
      it('Então grava VIGENTE', async () =>
        expect((await criar({ dataLimite: '2026-10-18' })).situacao).toBe('VIGENTE'));
    });

    describe('Cenário: período sobreposto (RN16)', () => {
      it('Então PANFLETO_PERIODO_SOBREPOSTO com o conflito e sem storage', async () => {
        existentes(['e1', '2026-11-10', '2026-11-20']);
        await expect(criar({ dataInicio: '2026-11-15', dataLimite: '2026-11-25' })).rejects.toMatchObject({
          codigo: CodigoErro.PANFLETO_PERIODO_SOBREPOSTO,
          detalhes: { conflitoCom: { id: 'e1', dataInicio: '2026-11-10', dataLimite: '2026-11-20' } },
        });
        expect(midia.salvar).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: sobreposto com agendado (RN16)', () => {
      it('Então PANFLETO_PERIODO_SOBREPOSTO', async () => {
        existentes(['a1', '2026-12-01', '2026-12-10']);
        await expect(criar({ dataInicio: '2026-11-25', dataLimite: '2026-12-01' })).rejects.toMatchObject({
          codigo: CodigoErro.PANFLETO_PERIODO_SOBREPOSTO,
        });
      });
    });

    describe('Cenário: atual sem data limite (RN17)', () => {
      it('Então PANFLETO_ATUAL_SEM_DATA_LIMITE, sem storage nem create', async () => {
        existentes(['s1', '2026-10-01', null]);
        await expect(criar({ dataInicio: '2026-11-01', dataLimite: '2026-11-10' })).rejects.toMatchObject({
          codigo: CodigoErro.PANFLETO_ATUAL_SEM_DATA_LIMITE,
        });
        expect(midia.salvar).not.toHaveBeenCalled();
        expect(panfletoModel.create).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: próximo agendado após o atual com limite', () => {
      it('Então grava AGENDADO', async () => {
        existentes(['v1', '2026-10-01', '2026-10-31']);
        expect((await criar({ dataInicio: '2026-11-01' })).situacao).toBe('AGENDADO');
      });
    });

    describe('Cenário: consulta de existentes é enxuta e travada', () => {
      it('Então trava a filial e lê só id e datas, tudo na mesma transação (paranoid ativo)', async () => {
        await criar();
        expect(filiais.obter).toHaveBeenCalledWith('t1', 'f1', { transaction: t, lock: 'UPDATE' });
        expect(panfletoModel.findAll).toHaveBeenCalledWith({
          where: { tenantId: 't1', filialId: 'f1' },
          attributes: ['id', 'dataInicio', 'dataLimite'],
          raw: true,
          transaction: t,
        });
      });
    });

    describe('Cenário: filial de outro tenant', () => {
      it('Então RECURSO_NAO_ENCONTRADO; processou a imagem, mas não salvou', async () => {
        filiais.obter.mockRejectedValue(naoEncontrado());
        await expect(criar()).rejects.toMatchObject({ codigo: CodigoErro.RECURSO_NAO_ENCONTRADO });
        expect(midia.processar).toHaveBeenCalled();
        expect(midia.salvar).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: imagem inválida', () => {
      it('Então IMAGEM_INVALIDA sem abrir transação', async () => {
        midia.processar.mockRejectedValue(new AppError(CodigoErro.IMAGEM_INVALIDA));
        await expect(criar()).rejects.toMatchObject({ codigo: CodigoErro.IMAGEM_INVALIDA });
        expect(sequelize.transaction).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: processamento antes da transação (D3.3)', () => {
      it('Então processar vem antes de sequelize.transaction', async () => {
        await criar();
        expect(midia.processar.mock.invocationCallOrder[0]).toBeLessThan(
          sequelize.transaction.mock.invocationCallOrder[0]!,
        );
      });
    });

    describe('Cenário: storage indisponível', () => {
      it('Então ARMAZENAMENTO_INDISPONIVEL, sem create e sem log de órfão', async () => {
        midia.salvar.mockRejectedValue(new AppError(CodigoErro.ARMAZENAMENTO_INDISPONIVEL));
        await expect(criar()).rejects.toMatchObject({ codigo: CodigoErro.ARMAZENAMENTO_INDISPONIVEL });
        expect(panfletoModel.create).not.toHaveBeenCalled();
        expect(avisos).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: falha no banco após upload gera log de órfão (D3.4)', () => {
      it('Então o erro original sobe e o caminho é logado', async () => {
        const erro = Object.assign(new Error('exclusion'), { parent: { code: '23P01' } });
        panfletoModel.create.mockRejectedValue(erro);
        await expect(criar()).rejects.toBe(erro);
        expect(avisos).toHaveBeenCalledWith(
          expect.objectContaining({
            evento: 'midia.arquivo_orfao',
            caminho: 't1/panfleto/novo.webp',
            tenantId: 't1',
          }),
        );
      });
    });

    describe('Cenário: criação grava auditoria com valor anterior nulo (D3.9)', () => {
      it('Então registrarCriacao recebe datas e imagem, na mesma transação', async () => {
        await criar({ dataInicio: '2026-11-01', dataLimite: '2026-11-15' });
        const id = panfletoModel.create.mock.calls[0]![0].id;
        expect(auditoria.registrarCriacao).toHaveBeenCalledWith(
          't1',
          'PANFLETO',
          id,
          { dataInicio: '2026-11-01', dataLimite: '2026-11-15', imagemPath: 't1/panfleto/novo.webp' },
          CAMPOS_AUDITADOS.PANFLETO,
          { transaction: t },
        );
      });
    });

    describe('Cenário: criação emite evento após o commit (D3.10)', () => {
      it('Então emite { tenantId, filialId } só no afterCommit', async () => {
        await criar();
        expect(t.afterCommit).toHaveBeenCalledTimes(1);
        expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1', filialId: 'f1' });
      });
    });

    describe('Cenário: criação com rollback não emite evento', () => {
      it('Então nada é emitido', async () => {
        panfletoModel.create.mockRejectedValue(new Error('falhou'));
        await criar().catch(() => undefined);
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });
  });

  describe('Funcionalidade: Listar e detalhar panfletos', () => {
    describe('Cenário: lista ordenada e paginada com situação calculada', () => {
      it('Então ordena por início e id decrescentes e calcula cada situação', async () => {
        panfletoModel.findAndCountAll.mockResolvedValue({
          rows: [
            umPanfleto({ id: 'a', dataInicio: '2026-11-01' }),
            umPanfleto({ id: 'v', dataInicio: '2026-10-10', dataLimite: '2026-10-30' }),
            umPanfleto({ id: 'x', dataInicio: '2026-09-01', dataLimite: '2026-09-30' }),
          ],
          count: 3,
        });
        const pagina = await service.listar('t1', 'f1', { pagina: 1, porPagina: 50 });
        expect(panfletoModel.findAndCountAll).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { tenantId: 't1', filialId: 'f1' },
            paranoid: true,
            order: [
              ['dataInicio', 'DESC'],
              ['id', 'DESC'],
            ],
            limit: 50,
            offset: 0,
          }),
        );
        expect(pagina.itens.map((p) => p.situacao)).toEqual(['AGENDADO', 'VIGENTE', 'VENCIDO']);
        expect(pagina).toMatchObject({ total: 3, pagina: 1, porPagina: 50 });
      });
    });

    describe('Cenário: hoje calculado uma vez', () => {
      it('Então ClockService.agora é lido 1 vez para 50 panfletos', async () => {
        panfletoModel.findAndCountAll.mockResolvedValue({
          rows: Array.from({ length: 50 }, (_, i) => umPanfleto({ id: `p${i}` })),
          count: 50,
        });
        await service.listar('t1', 'f1', { pagina: 1, porPagina: 50 });
        expect(clock.agora).toHaveBeenCalledTimes(1);
      });
    });

    describe('Cenário: filtro por situação delega ao filtroSituacao', () => {
      it('Então o where contém a condição de vigência', async () => {
        panfletoModel.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
        await service.listar('t1', 'f1', { pagina: 2, porPagina: 10, situacao: ['VIGENTE'] });
        const [opcoes] = panfletoModel.findAndCountAll.mock.calls[0]!;
        expect(opcoes.where.dataInicio).toEqual({ [Op.lte]: '2026-10-18' });
        expect(opcoes).toMatchObject({ limit: 10, offset: 10, paranoid: true });
      });
    });

    describe('Cenário: filial inexistente', () => {
      it('Então RECURSO_NAO_ENCONTRADO', async () => {
        filiais.obter.mockRejectedValue(naoEncontrado());
        await expect(service.listar('t1', 'f9', { pagina: 1, porPagina: 50 })).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
      });
    });

    describe('Cenário: detalhar panfleto excluído (consulta, RN25)', () => {
      it('Então EXCLUIDO, não editável e com excluidoEm', async () => {
        panfletoModel.findOne.mockResolvedValue(umPanfleto({ deletedAt: new Date('2026-10-15T10:00:00Z') }));
        const view = await service.detalhar('t1', 'f1', 'p1');
        expect(panfletoModel.findOne).toHaveBeenCalledWith({
          where: { id: 'p1', tenantId: 't1', filialId: 'f1' },
          paranoid: false,
        });
        expect(view).toMatchObject({
          situacao: 'EXCLUIDO',
          editavel: false,
          excluidoEm: '2026-10-15T10:00:00.000Z',
        });
      });
    });

    describe('Cenário: detalhar panfleto de outra filial do mesmo tenant', () => {
      it('Então RECURSO_NAO_ENCONTRADO', async () => {
        panfletoModel.findOne.mockResolvedValue(null);
        await expect(service.detalhar('t1', 'f2', 'p1')).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
      });
    });
  });

  describe('Funcionalidade: Editar datas do panfleto (RN26, RNF07)', () => {
    const editar = (atual: Record<string, unknown>, dto: Record<string, string | null>) => {
      const panfleto = umPanfleto(atual);
      panfletoModel.findOne.mockResolvedValue(panfleto);
      return { panfleto, resultado: service.editarDatas('t1', 'f1', 'p1', dto as never) };
    };

    describe('Cenário: estender data limite de vigente', () => {
      it('Então atualiza e audita dataLimite', async () => {
        const { panfleto, resultado } = editar({ dataLimite: '2026-10-20' }, { dataLimite: '2026-10-25' });
        await resultado;
        expect(panfleto.update).toHaveBeenCalledWith(
          { dataInicio: '2026-10-01', dataLimite: '2026-10-25' },
          { transaction: t },
        );
        expect(auditoria.registrarAlteracoes).toHaveBeenCalledWith(
          't1',
          'PANFLETO',
          'p1',
          { dataInicio: '2026-10-01', dataLimite: '2026-10-20' },
          { dataInicio: '2026-10-01', dataLimite: '2026-10-25' },
          CAMPOS_AUDITADOS.PANFLETO,
          { transaction: t },
        );
      });
    });

    describe.each([
      [
        'encurtar data limite de vigente até hoje',
        { dataLimite: '2026-10-31' },
        { dataLimite: '2026-10-18' },
      ],
      ['definir data limite no atual para liberar o próximo (RN17)', {}, { dataLimite: '2026-10-31' }],
      ['remover data limite (D3.7)', { dataLimite: '2026-10-31' }, { dataLimite: null }],
      [
        'reenviar o mesmo início de vigente',
        { dataLimite: '2026-10-20' },
        { dataInicio: '2026-10-01', dataLimite: '2026-10-22' },
      ],
      [
        'adiar agendado',
        { dataInicio: '2026-11-01', dataLimite: '2026-11-10' },
        { dataInicio: '2026-11-05', dataLimite: '2026-11-15' },
      ],
      [
        'edição não conflita consigo mesma',
        { dataInicio: '2026-11-01', dataLimite: '2026-11-10' },
        { dataLimite: '2026-11-12' },
      ],
    ])('Cenário: %s', (_nome, atual: Record<string, string>, dto) => {
      it('Então é aceito e atualizado', async () => {
        existentes(['p1', atual.dataInicio ?? '2026-10-01', atual.dataLimite ?? null]);
        const { panfleto, resultado } = editar(atual, dto);
        await resultado;
        expect(panfleto.update).toHaveBeenCalled();
      });
    });

    describe('Cenário: antecipar agendado para hoje', () => {
      it('Então passa a VIGENTE', async () => {
        const { resultado } = editar(
          { dataInicio: '2026-11-01', dataLimite: '2026-11-10' },
          { dataInicio: '2026-10-18' },
        );
        expect((await resultado).situacao).toBe('VIGENTE');
      });
    });

    describe('Cenário: remover data limite gera sobreposição', () => {
      it('Então PANFLETO_PERIODO_SOBREPOSTO com Q', async () => {
        existentes(['p1', '2026-10-01', '2026-10-31'], ['q', '2026-11-01', '2026-11-10']);
        const { resultado } = editar({ dataLimite: '2026-10-31' }, { dataLimite: null });
        await expect(resultado).rejects.toMatchObject({
          codigo: CodigoErro.PANFLETO_PERIODO_SOBREPOSTO,
          detalhes: { conflitoCom: { id: 'q' } },
        });
      });
    });

    describe.each([
      ['alterar início de vigente (RN26)', {}, { dataInicio: '2026-10-05' }, 'DATA_INICIO_IMUTAVEL'],
      [
        'editar vencido (RN26)',
        { dataLimite: '2026-10-10' },
        { dataLimite: '2026-10-30' },
        'ITEM_NAO_EDITAVEL',
      ],
      [
        'adiar agendado para data passada',
        { dataInicio: '2026-11-01' },
        { dataInicio: '2026-10-17' },
        'DATA_INICIO_INVALIDA',
      ],
    ])('Cenário: %s', (_nome, atual, dto, codigo) => {
      it(`Então ${codigo}, sem gravar nem emitir`, async () => {
        const { panfleto, resultado } = editar(atual, dto);
        await expect(resultado).rejects.toMatchObject({ codigo });
        expect(panfleto.update).not.toHaveBeenCalled();
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: editar excluído', () => {
      it('Então RECURSO_NAO_ENCONTRADO (paranoid ativo na busca travada)', async () => {
        panfletoModel.findOne.mockResolvedValue(null);
        await expect(
          service.editarDatas('t1', 'f1', 'p1', { dataLimite: '2026-10-30' as DataISO }),
        ).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
        expect(panfletoModel.findOne).toHaveBeenCalledWith(
          expect.objectContaining({ lock: 'UPDATE', transaction: t }),
        );
      });
    });

    describe('Cenário: edição sem mudança é no-op', () => {
      it('Então não grava, não audita e não emite', async () => {
        const { panfleto, resultado } = editar(
          { dataInicio: '2026-11-01', dataLimite: '2026-11-10' },
          { dataInicio: '2026-11-01', dataLimite: '2026-11-10' },
        );
        await resultado;
        expect(panfleto.update).not.toHaveBeenCalled();
        expect(auditoria.registrarAlteracoes).not.toHaveBeenCalled();
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: edição emite evento após o commit (D3.10)', () => {
      it('Então emite { tenantId, filialId }', async () => {
        await editar({ dataLimite: '2026-10-20' }, { dataLimite: '2026-10-25' }).resultado;
        expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1', filialId: 'f1' });
      });
    });
  });

  describe('Funcionalidade: Trocar imagem do panfleto (D3.2)', () => {
    const trocar = (atual: Record<string, unknown> = {}) => {
      const panfleto = umPanfleto(atual);
      panfletoModel.findOne.mockResolvedValue(panfleto);
      return { panfleto, resultado: service.trocarImagem('t1', 'f1', 'p1', Buffer.from('img')) };
    };

    describe('Cenário: troca em vigente', () => {
      it('Então atualiza imagem e dimensões e audita imagemPath', async () => {
        const { panfleto, resultado } = trocar();
        const view = await resultado;
        expect(panfleto.update).toHaveBeenCalledWith(
          { imagemPath: 't1/panfleto/novo.webp', imagemLargura: 1697, imagemAltura: 2400 },
          { transaction: t },
        );
        expect(auditoria.registrarAlteracoes).toHaveBeenCalledWith(
          't1',
          'PANFLETO',
          'p1',
          { imagemPath: 't1/panfleto/antigo.webp' },
          { imagemPath: 't1/panfleto/novo.webp' },
          CAMPOS_AUDITADOS.PANFLETO,
          { transaction: t },
        );
        expect(view.urlImagem).toBe('https://cdn/t1/panfleto/novo.webp');
        expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1', filialId: 'f1' });
      });
    });

    describe('Cenário: troca em agendado', () => {
      it('Então é aceito', async () => {
        const { panfleto, resultado } = trocar({ dataInicio: '2026-11-01' });
        await resultado;
        expect(panfleto.update).toHaveBeenCalled();
      });
    });

    describe('Cenário: troca em vencido', () => {
      it('Então ITEM_NAO_EDITAVEL sem salvar no storage', async () => {
        const { resultado } = trocar({ dataLimite: '2026-10-10' });
        await expect(resultado).rejects.toMatchObject({ codigo: CodigoErro.ITEM_NAO_EDITAVEL });
        expect(midia.salvar).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: arquivo anterior não é removido', () => {
      it('Então o MidiaService não tem nem recebe chamada de remoção', async () => {
        await trocar().resultado;
        expect(Object.keys(midia)).toEqual(['processar', 'salvar', 'urlPublica']);
      });
    });

    describe('Cenário: falha no update após o upload', () => {
      it('Então loga o arquivo órfão e não emite', async () => {
        const panfleto = umPanfleto();
        panfleto.update.mockRejectedValue(new Error('falhou'));
        panfletoModel.findOne.mockResolvedValue(panfleto);
        await expect(service.trocarImagem('t1', 'f1', 'p1', Buffer.from('img'))).rejects.toThrow('falhou');
        expect(avisos).toHaveBeenCalledWith(expect.objectContaining({ evento: 'midia.arquivo_orfao' }));
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });
  });

  describe('Funcionalidade: Excluir panfleto (RN25)', () => {
    describe('Cenário: exclusão lógica', () => {
      it('Então destroy por id, tenant e filial, sem force, e evento após o commit', async () => {
        panfletoModel.destroy.mockResolvedValue(1);
        await service.excluir('t1', 'f1', 'p1');
        expect(panfletoModel.destroy).toHaveBeenCalledWith({
          where: { id: 'p1', tenantId: 't1', filialId: 'f1' },
          transaction: t,
        });
        expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1', filialId: 'f1' });
      });
    });

    describe('Cenário: já excluído ou inexistente', () => {
      it('Então RECURSO_NAO_ENCONTRADO e nenhum evento', async () => {
        panfletoModel.destroy.mockResolvedValue(0);
        await expect(service.excluir('t1', 'f1', 'p1')).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
        expect(eventos.emit).not.toHaveBeenCalled();
      });
    });
  });
});
