import { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Sequelize } from 'sequelize-typescript';
import { sequelizeFake, transacaoFake } from '../../../../test/helpers/transacao-fake';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import type { MidiaService } from '../../midia/services/midia.service';
import type { Lojista } from '../models/lojista.model';
import { ConfiguracaoPaginaService } from '../services/configuracao-pagina.service';

const EVENTO = 'filial.conteudo-alterado';

describe('Funcionalidade: Aparência da página do lojista (RN46, RN47, RN48)', () => {
  const lojistaModel = { findOne: jest.fn(), update: jest.fn() };
  const midia = { processar: jest.fn(), salvar: jest.fn(), urlPublica: jest.fn() };
  const eventos = { emit: jest.fn() };
  const sequelize = { transaction: jest.fn() };
  let transacao = transacaoFake();
  const service = new ConfiguracaoPaginaService(
    sequelize as unknown as Sequelize,
    lojistaModel as unknown as typeof Lojista,
    midia as unknown as MidiaService,
    eventos as unknown as EventEmitter2,
  );
  let avisos: jest.SpyInstance;

  const comConfiguracao = (configuracaoPagina: unknown) =>
    lojistaModel.findOne.mockResolvedValue({ id: 't1', configuracaoPagina });
  const gravada = () => lojistaModel.update.mock.calls[0]![0].configuracaoPagina;

  beforeEach(() => {
    jest.resetAllMocks();
    transacao = transacaoFake();
    sequelize.transaction.mockImplementation(sequelizeFake(transacao).transaction);
    comConfiguracao({});
    midia.urlPublica.mockImplementation((c: string | null) => (c ? `https://cdn/${c}` : null));
    avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => avisos.mockRestore());

  describe('Cenário: obter sem configuração', () => {
    it('Então tudo padrão (cores null), buscando só a coluna do tenant', async () => {
      await expect(service.obter('t1')).resolves.toEqual({
        banner: { exibir: false, nome: null, urlLogo: null, campanha: null },
        exibirNomeCategoria: true,
        cores: {
          primaria: null,
          secundaria: null,
          texto: null,
          textoSuave: null,
          fundoCartao: null,
          fundoPagina: null,
          neutra: null,
          sobreCor: null,
          fundoBanner: null,
          categoria: null,
        },
      });
      expect(lojistaModel.findOne).toHaveBeenCalledWith({
        where: { id: 't1' },
        attributes: ['id', 'configuracaoPagina'],
      });
    });
  });

  describe('Cenário: obter com logo e foto', () => {
    it('Então URLs públicas, sem path nem tenantId', async () => {
      comConfiguracao({
        banner: {
          exibir: true,
          logoPath: 't1/logo/l.webp',
          campanha: { tipo: 'FOTO', fotoPath: 't1/banner/b.webp' },
        },
      });
      const view = await service.obter('t1');
      expect(view.banner).toEqual({
        exibir: true,
        nome: null,
        urlLogo: 'https://cdn/t1/logo/l.webp',
        campanha: { tipo: 'FOTO', urlFoto: 'https://cdn/t1/banner/b.webp' },
      });
      expect(JSON.stringify(view)).not.toMatch(/Path|tenant/);
    });
  });

  describe('Cenário: obter com descrição', () => {
    it('Então campanha DESCRICAO', async () => {
      comConfiguracao({ banner: { campanha: { tipo: 'DESCRICAO', descricao: 'Tudo fresco' } } });
      expect((await service.obter('t1')).banner.campanha).toEqual({
        tipo: 'DESCRICAO',
        descricao: 'Tudo fresco',
      });
    });
  });

  describe('Cenário: lojista inexistente', () => {
    it('Então RECURSO_NAO_ENCONTRADO no obter e no editar', async () => {
      lojistaModel.findOne.mockResolvedValue(null);
      await expect(service.obter('t9')).rejects.toMatchObject({ codigo: CodigoErro.RECURSO_NAO_ENCONTRADO });
      await expect(service.editar('t9', { exibirNomeCategoria: false })).rejects.toMatchObject({
        codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
      });
      expect(lojistaModel.update).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: editar parcialmente', () => {
    it('Então trava a linha, grava o JSON mesclado, emite sem filialId após o commit e devolve a view', async () => {
      comConfiguracao({ cores: { primaria: '#C8102E' } });
      const view = await service.editar('t1', {
        banner: { exibir: true, nome: 'Semana' },
        cores: { texto: '#112233' },
      });

      expect(lojistaModel.findOne).toHaveBeenCalledWith({
        where: { id: 't1' },
        attributes: ['id', 'configuracaoPagina'],
        transaction: transacao,
        lock: 'UPDATE',
      });
      expect(lojistaModel.update).toHaveBeenCalledWith(
        { configuracaoPagina: expect.any(Object) },
        { where: { id: 't1' }, transaction: transacao },
      );
      expect(gravada()).toMatchObject({
        banner: { exibir: true, nome: 'Semana' },
        cores: { primaria: '#C8102E', texto: '#112233' },
      });
      expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1' });
      expect(view.cores).toMatchObject({ primaria: '#C8102E', texto: '#112233', neutra: null });
      expect(view.banner).toMatchObject({ exibir: true, nome: 'Semana' });
    });
  });

  describe('Cenário: edição que não muda nada', () => {
    it('Então não grava nem emite', async () => {
      comConfiguracao({ exibirNomeCategoria: false });
      await service.editar('t1', { exibirNomeCategoria: false });
      expect(lojistaModel.update).not.toHaveBeenCalled();
      expect(eventos.emit).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: falha ao gravar', () => {
    it('Então o erro sobe sem evento', async () => {
      lojistaModel.update.mockRejectedValue(new Error('falhou'));
      await expect(service.editar('t1', { exibirNomeCategoria: false })).rejects.toThrow('falhou');
      expect(eventos.emit).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: trocar o logo do banner', () => {
    it('Então processa e salva no perfil logo, grava o path e devolve a URL', async () => {
      const imagem = { conteudo: Buffer.from('w') };
      midia.processar.mockResolvedValue(imagem);
      midia.salvar.mockResolvedValue('t1/logo/novo.webp');

      const view = await service.trocarLogoBanner('t1', Buffer.from('png'));

      expect(midia.processar).toHaveBeenCalledWith('t1', Buffer.from('png'), 'logo');
      expect(midia.salvar).toHaveBeenCalledWith('t1', 'logo', imagem);
      expect(gravada().banner.logoPath).toBe('t1/logo/novo.webp');
      expect(view.banner.urlLogo).toBe('https://cdn/t1/logo/novo.webp');
      expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1' });
    });
  });

  describe('Cenário: trocar a foto com campanha DESCRICAO', () => {
    it('Então perfil banner e a campanha vira FOTO', async () => {
      comConfiguracao({ banner: { campanha: { tipo: 'DESCRICAO', descricao: 'x' } } });
      midia.processar.mockResolvedValue({});
      midia.salvar.mockResolvedValue('t1/banner/novo.webp');

      const view = await service.trocarFotoBanner('t1', Buffer.from('jpg'));

      expect(midia.processar).toHaveBeenCalledWith('t1', Buffer.from('jpg'), 'banner');
      expect(midia.salvar).toHaveBeenCalledWith('t1', 'banner', {});
      expect(gravada().banner.campanha).toEqual({ tipo: 'FOTO', fotoPath: 't1/banner/novo.webp' });
      expect(view.banner.campanha).toEqual({ tipo: 'FOTO', urlFoto: 'https://cdn/t1/banner/novo.webp' });
    });
  });

  describe.each([
    ['inválida', CodigoErro.IMAGEM_INVALIDA],
    ['acima do limite', CodigoErro.IMAGEM_MUITO_GRANDE],
  ])('Cenário: imagem %s', (_rotulo, codigo) => {
    it(`Então ${codigo} e nada é salvo nem gravado`, async () => {
      midia.processar.mockRejectedValue(new AppError(codigo));
      await expect(service.trocarFotoBanner('t1', Buffer.from('x'))).rejects.toMatchObject({ codigo });
      expect(midia.salvar).not.toHaveBeenCalled();
      expect(lojistaModel.update).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: falha no banco depois do upload', () => {
    it('Então loga o órfão e não emite', async () => {
      midia.processar.mockResolvedValue({});
      midia.salvar.mockResolvedValue('t1/logo/novo.webp');
      lojistaModel.update.mockRejectedValue(new Error('falhou'));
      await expect(service.trocarLogoBanner('t1', Buffer.from('x'))).rejects.toThrow('falhou');
      expect(avisos).toHaveBeenCalledWith(
        expect.objectContaining({
          evento: 'midia.arquivo_orfao',
          caminho: 't1/logo/novo.webp',
          tenantId: 't1',
        }),
      );
      expect(eventos.emit).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: remover o logo do banner', () => {
    it('Então logoPath vira null e emite', async () => {
      comConfiguracao({ banner: { logoPath: 't1/logo/l.webp' } });
      const view = await service.removerLogoBanner('t1');
      expect(gravada().banner.logoPath).toBeNull();
      expect(view.banner.urlLogo).toBeNull();
      expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1' });
    });

    it('E sem logo não grava nem emite', async () => {
      await service.removerLogoBanner('t1');
      expect(lojistaModel.update).not.toHaveBeenCalled();
      expect(eventos.emit).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: remover a foto', () => {
    it('Então com FOTO fica sem campanha', async () => {
      comConfiguracao({ banner: { campanha: { tipo: 'FOTO', fotoPath: 't1/banner/b.webp' } } });
      const view = await service.removerFotoBanner('t1');
      expect(gravada().banner.campanha).toBeNull();
      expect(view.banner.campanha).toBeNull();
    });

    it('E com DESCRICAO nada muda, sem gravar', async () => {
      comConfiguracao({ banner: { campanha: { tipo: 'DESCRICAO', descricao: 'x' } } });
      const view = await service.removerFotoBanner('t1');
      expect(view.banner.campanha).toEqual({ tipo: 'DESCRICAO', descricao: 'x' });
      expect(lojistaModel.update).not.toHaveBeenCalled();
    });
  });
});
