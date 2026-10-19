import { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
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
  const service = new IdentidadeService(
    lojistaModel as unknown as typeof Lojista,
    midia as unknown as MidiaService,
    eventos as unknown as EventEmitter2,
  );
  let avisos: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    lojistaModel.findOne.mockResolvedValue({
      id: 't1',
      nomeFantasia: 'Mercado',
      corPrimaria: null,
      corSecundaria: null,
      logoPath: null,
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
      });
      expect(lojistaModel.findOne).toHaveBeenCalledWith({
        where: { id: 't1' },
        attributes: ['id', 'nomeFantasia', 'corPrimaria', 'corSecundaria', 'logoPath'],
      });
    });
  });

  describe('Cenário: lojista inexistente', () => {
    it('Então RECURSO_NAO_ENCONTRADO', async () => {
      lojistaModel.findOne.mockResolvedValue(null);
      await expect(service.obter('t9')).rejects.toMatchObject({ codigo: CodigoErro.RECURSO_NAO_ENCONTRADO });
    });
  });

  describe('Cenário: editar só um campo', () => {
    it('Então update recebe só corSecundaria, com where do tenant', async () => {
      await service.editar('t1', { corSecundaria: '#FFD100' });
      expect(lojistaModel.update).toHaveBeenCalledWith({ corSecundaria: '#FFD100' }, { where: { id: 't1' } });
    });
  });

  describe('Cenário: remover cor', () => {
    it('Então corPrimaria vai como null', async () => {
      await service.editar('t1', { corPrimaria: null });
      expect(lojistaModel.update).toHaveBeenCalledWith({ corPrimaria: null }, { where: { id: 't1' } });
    });
  });

  describe('Cenário: editar nome e cores juntos', () => {
    it('Então update recebe os três campos', async () => {
      await service.editar('t1', { nomeFantasia: 'Novo', corPrimaria: '#C8102E', corSecundaria: '#FFD100' });
      expect(lojistaModel.update.mock.calls[0]![0]).toEqual({
        nomeFantasia: 'Novo',
        corPrimaria: '#C8102E',
        corSecundaria: '#FFD100',
      });
    });
  });

  describe('Cenário: editar identidade emite evento para todas as filiais (D3.10)', () => {
    it('Então { tenantId } sem filialId, depois do update', async () => {
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
