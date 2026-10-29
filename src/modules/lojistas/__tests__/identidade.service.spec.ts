import { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Sequelize } from 'sequelize-typescript';
import { sequelizeFake, transacaoFake } from '../../../../test/helpers/transacao-fake';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import type { MidiaService } from '../../midia/services/midia.service';
import type { Lojista } from '../models/lojista.model';
import { IdentidadeService } from '../services/identidade.service';

const EVENTO = 'filial.conteudo-alterado';

describe('Funcionalidade: Identidade visual do lojista (RN06)', () => {
  const lojistaModel = { findOne: jest.fn(), update: jest.fn() };
  const midia = { processar: jest.fn(), salvar: jest.fn(), urlPublica: jest.fn() };
  const eventos = { emit: jest.fn() };
  let transacao = transacaoFake();
  const sequelize = { transaction: jest.fn() };
  const service = new IdentidadeService(
    sequelize as unknown as Sequelize,
    lojistaModel as unknown as typeof Lojista,
    midia as unknown as MidiaService,
    eventos as unknown as EventEmitter2,
  );
  let avisos: jest.SpyInstance;

  const comTransacao = { where: { id: 't1' }, transaction: expect.anything() };
  /** Valor gravado em configuracao_pagina pelo último update. */
  const configuracaoGravada = () =>
    (lojistaModel.update.mock.calls.at(-1)![0] as { configuracaoPagina: { cores: Record<string, unknown> } })
      .configuracaoPagina;

  beforeEach(() => {
    jest.resetAllMocks();
    transacao = transacaoFake();
    sequelize.transaction.mockImplementation(sequelizeFake(transacao).transaction);
    lojistaModel.findOne.mockResolvedValue({
      id: 't1',
      nomeFantasia: 'Mercado',
      configuracaoPagina: {},
      logoPath: null,
      sePanfleto: false,
    });
    midia.urlPublica.mockImplementation((c: string | null) => (c ? `https://cdn/${c}` : null));
    avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => avisos.mockRestore());

  describe('Cenário: obter identidade sem logo', () => {
    it('Então cores e urlLogo nulos, buscando só os campos da identidade do tenant', async () => {
      await expect(service.obter('t1')).resolves.toEqual({
        nomeFantasia: 'Mercado',
        corPrimaria: null,
        corSecundaria: null,
        urlLogo: null,
        sePanfleto: false,
      });
      expect(lojistaModel.findOne).toHaveBeenCalledWith({
        where: { id: 't1' },
        attributes: ['id', 'nomeFantasia', 'configuracaoPagina', 'logoPath', 'sePanfleto'],
      });
    });
  });

  describe('Cenário: lojista inexistente', () => {
    it('Então RECURSO_NAO_ENCONTRADO', async () => {
      lojistaModel.findOne.mockResolvedValue(null);
      await expect(service.obter('t9')).rejects.toMatchObject({ codigo: CodigoErro.RECURSO_NAO_ENCONTRADO });
    });
  });

  describe('Cenário: obter cores gravadas no JSON da aparência (RN48)', () => {
    it('Então corPrimaria/corSecundaria vêm de configuracao_pagina.cores, cruas', async () => {
      lojistaModel.findOne.mockResolvedValue({
        nomeFantasia: 'Mercado',
        configuracaoPagina: { cores: { primaria: '#C8102E', texto: '#112233' } },
        logoPath: null,
        sePanfleto: false,
      });
      await expect(service.obter('t1')).resolves.toMatchObject({
        corPrimaria: '#C8102E',
        corSecundaria: null,
      });
    });
  });

  describe('Cenário: editar só a cor secundária', () => {
    it('Então trava a linha e grava a cor no JSON, mantendo as outras cores, não nas colunas', async () => {
      lojistaModel.findOne.mockResolvedValueOnce({
        id: 't1',
        configuracaoPagina: { cores: { primaria: '#C8102E', texto: '#112233' } },
      });
      await service.editar('t1', { corSecundaria: '#FFD100' });
      expect(lojistaModel.findOne).toHaveBeenNthCalledWith(1, {
        where: { id: 't1' },
        attributes: ['id', 'configuracaoPagina'],
        transaction: transacao,
        lock: 'UPDATE',
      });
      expect(lojistaModel.update).toHaveBeenCalledWith(
        { configuracaoPagina: expect.any(Object) },
        { where: { id: 't1' }, transaction: transacao },
      );
      expect(configuracaoGravada().cores).toMatchObject({
        primaria: '#C8102E',
        secundaria: '#FFD100',
        texto: '#112233',
      });
    });
  });

  describe('Cenário: editar só o nome', () => {
    it('Então não lê nem grava a aparência', async () => {
      await service.editar('t1', { nomeFantasia: 'Novo' });
      expect(lojistaModel.update).toHaveBeenCalledWith({ nomeFantasia: 'Novo' }, comTransacao);
      expect(lojistaModel.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cenário: editar cor de lojista inexistente', () => {
    it('Então RECURSO_NAO_ENCONTRADO sem update nem evento', async () => {
      lojistaModel.findOne.mockResolvedValue(null);
      await expect(service.editar('t9', { corPrimaria: '#C8102E' })).rejects.toMatchObject({
        codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
      });
      expect(lojistaModel.update).not.toHaveBeenCalled();
      expect(eventos.emit).not.toHaveBeenCalled();
    });
  });

  describe('Funcionalidade: Chave "mostrar só o panfleto" (RN44)', () => {
    describe('Cenário: ligar a chave', () => {
      it('Então grava sePanfleto true, emite o evento só com tenantId e responde com a chave', async () => {
        lojistaModel.findOne.mockResolvedValue({
          id: 't1',
          nomeFantasia: 'Mercado',
          logoPath: null,
          sePanfleto: true,
        });
        const resposta = await service.editar('t1', { sePanfleto: true });
        expect(lojistaModel.update).toHaveBeenCalledWith({ sePanfleto: true }, comTransacao);
        expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1' });
        expect(resposta.sePanfleto).toBe(true);
      });
    });

    describe('Cenário: editar só as cores não mexe na chave', () => {
      it('Então sePanfleto não está nos campos gravados', async () => {
        await service.editar('t1', { corPrimaria: '#C8102E' });
        expect(lojistaModel.update.mock.calls[0]![0]).not.toHaveProperty('sePanfleto');
      });
    });
  });

  describe('Cenário: remover cor volta ao padrão', () => {
    it('Então a primária vai como null no JSON', async () => {
      lojistaModel.findOne.mockResolvedValueOnce({
        id: 't1',
        configuracaoPagina: { cores: { primaria: '#C8102E' } },
      });
      await service.editar('t1', { corPrimaria: null });
      expect(configuracaoGravada().cores.primaria).toBeNull();
    });
  });

  describe('Cenário: editar nome e cores juntos', () => {
    it('Então update recebe o nome e o JSON com as duas cores', async () => {
      await service.editar('t1', { nomeFantasia: 'Novo', corPrimaria: '#C8102E', corSecundaria: '#FFD100' });
      const campos = lojistaModel.update.mock.calls[0]![0];
      expect(campos.nomeFantasia).toBe('Novo');
      expect(campos).not.toHaveProperty('corPrimaria');
      expect(configuracaoGravada().cores).toMatchObject({ primaria: '#C8102E', secundaria: '#FFD100' });
    });
  });

  describe('Cenário: editar identidade emite evento para todas as filiais (D3.10)', () => {
    it('Então { tenantId } sem filialId, depois do update (após o commit)', async () => {
      await service.editar('t1', { corPrimaria: '#C8102E' });
      expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1' });
      expect(eventos.emit.mock.invocationCallOrder[0]).toBeGreaterThan(
        lojistaModel.update.mock.invocationCallOrder[0]!,
      );
    });
  });

  describe('Cenário: identidade inválida não emite evento', () => {
    it('Então o erro do CHECK sobe sem evento', async () => {
      lojistaModel.update.mockRejectedValue(new Error('check'));
      await expect(service.editar('t1', { corPrimaria: '#C8102E' })).rejects.toThrow('check');
      expect(eventos.emit).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: trocar logo', () => {
    it('Então processa e salva no perfil logo, grava logoPath, emite e devolve a URL nova', async () => {
      const imagem = { conteudo: Buffer.from('w') };
      midia.processar.mockResolvedValue(imagem);
      midia.salvar.mockResolvedValue('t1/logo/novo.webp');
      lojistaModel.findOne.mockResolvedValue({ nomeFantasia: 'M', logoPath: 't1/logo/novo.webp' });

      const view = await service.trocarLogo('t1', Buffer.from('png'));

      expect(midia.processar).toHaveBeenCalledWith('t1', Buffer.from('png'), 'logo');
      expect(midia.salvar).toHaveBeenCalledWith('t1', 'logo', imagem);
      expect(lojistaModel.update).toHaveBeenCalledWith(
        { logoPath: 't1/logo/novo.webp' },
        { where: { id: 't1' } },
      );
      expect(view.urlLogo).toBe('https://cdn/t1/logo/novo.webp');
      expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1' });
    });
  });

  describe('Cenário: logo inválido', () => {
    it('Então IMAGEM_INVALIDA e logoPath não muda', async () => {
      midia.processar.mockRejectedValue(new AppError(CodigoErro.IMAGEM_INVALIDA));
      await expect(service.trocarLogo('t1', Buffer.from('x'))).rejects.toMatchObject({
        codigo: CodigoErro.IMAGEM_INVALIDA,
      });
      expect(lojistaModel.update).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: falha no update após upload do logo', () => {
    it('Então loga o órfão e não emite', async () => {
      midia.processar.mockResolvedValue({});
      midia.salvar.mockResolvedValue('t1/logo/novo.webp');
      lojistaModel.update.mockRejectedValue(new Error('falhou'));
      await expect(service.trocarLogo('t1', Buffer.from('x'))).rejects.toThrow('falhou');
      expect(avisos).toHaveBeenCalledWith(
        expect.objectContaining({ evento: 'midia.arquivo_orfao', caminho: 't1/logo/novo.webp' }),
      );
      expect(eventos.emit).not.toHaveBeenCalled();
    });
  });
});
