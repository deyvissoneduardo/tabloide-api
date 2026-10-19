import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { Sequelize } from 'sequelize-typescript';
import { sequelizeFake, transacaoFake } from '../../../../test/helpers/transacao-fake';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { naoEncontrado } from '../../../common/errors/errors';
import { FiliaisService } from '../../filiais/services/filiais.service';
import { MidiaService } from '../../midia/services/midia.service';
import { VigenciaService } from '../../vigencia/services/vigencia.service';
import { ProdutoFotoService } from '../services/produto-foto.service';
import { ProdutosService } from '../services/produtos.service';

const EVENTO = 'filial.conteudo-alterado';
const IMAGEM = { conteudo: Buffer.from('w'), largura: 800, altura: 800, contentType: 'image/webp', bytes: 1 };
const HOJE = '2026-10-18';
const naoEditavel = () => new AppError(CodigoErro.ITEM_NAO_EDITAVEL);

function umProduto(fotoPath: string | null = 't1/produto/antiga.webp') {
  const produto: Record<string, unknown> = { id: 'p1', fotoPath };
  produto.update = jest.fn(async (v: object) => Object.assign(produto, v));
  return produto as { id: string; fotoPath: string | null; update: jest.Mock };
}

describe('Funcionalidade: Trocar e remover foto do produto', () => {
  let service: ProdutoFotoService;
  let t: ReturnType<typeof transacaoFake>;
  let sequelize: ReturnType<typeof sequelizeFake>;
  const filiais = { obter: jest.fn() };
  const vigencia = { hojeDaFilial: jest.fn() };
  const produtos = { obterEditavel: jest.fn(), paraView: jest.fn() };
  const midia = { processar: jest.fn(), salvar: jest.fn() };
  const eventos = { emit: jest.fn() };
  let avisos: jest.SpyInstance;

  beforeEach(async () => {
    jest.resetAllMocks();
    t = transacaoFake();
    sequelize = sequelizeFake(t);
    filiais.obter.mockResolvedValue({ id: 'f1', fusoHorario: 'America/Sao_Paulo' });
    vigencia.hojeDaFilial.mockReturnValue(HOJE);
    midia.processar.mockResolvedValue(IMAGEM);
    midia.salvar.mockResolvedValue('t1/produto/nova.webp');
    produtos.paraView.mockImplementation(async (p: { fotoPath: string | null }) => ({
      urlFoto: p.fotoPath && `https://cdn/${p.fotoPath}`,
    }));
    avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const modulo = await Test.createTestingModule({
      providers: [
        ProdutoFotoService,
        { provide: Sequelize, useValue: sequelize },
        { provide: FiliaisService, useValue: filiais },
        { provide: VigenciaService, useValue: vigencia },
        { provide: ProdutosService, useValue: produtos },
        { provide: MidiaService, useValue: midia },
        { provide: EventEmitter2, useValue: eventos },
      ],
    }).compile();
    service = modulo.get(ProdutoFotoService);
  });
  afterEach(() => avisos.mockRestore());

  const substituir = () => service.substituir('t1', 'f1', 'p1', Buffer.from('img'));

  describe('Cenário: trocar foto de produto vigente ou agendado', () => {
    it('Então processa com perfil "produto", aponta para o novo caminho e emite após o commit', async () => {
      const produto = umProduto();
      produtos.obterEditavel.mockResolvedValue(produto);
      const view = await substituir();
      expect(produtos.obterEditavel).toHaveBeenNthCalledWith(1, 't1', 'f1', 'p1', HOJE);
      expect(produtos.obterEditavel).toHaveBeenNthCalledWith(2, 't1', 'f1', 'p1', HOJE, t);
      expect(midia.processar).toHaveBeenCalledWith('t1', Buffer.from('img'), 'produto');
      expect(midia.salvar).toHaveBeenCalledWith('t1', 'produto', IMAGEM);
      expect(produto.update).toHaveBeenCalledWith({ fotoPath: 't1/produto/nova.webp' }, { transaction: t });
      expect(view.urlFoto).toBe('https://cdn/t1/produto/nova.webp');
      expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1', filialId: 'f1' });
    });

    it('E nenhum arquivo é apagado do storage (D4.5)', async () => {
      produtos.obterEditavel.mockResolvedValue(umProduto());
      await substituir();
      expect(Object.keys(midia)).toEqual(['processar', 'salvar']);
    });
  });

  describe('Cenário: produto vencido, excluído ou de outro tenant', () => {
    it.each([
      ['vencido ou excluído', naoEditavel, CodigoErro.ITEM_NAO_EDITAVEL],
      ['de outro tenant', naoEncontrado, CodigoErro.RECURSO_NAO_ENCONTRADO],
    ])('Quando %s, então o erro sai antes de processar a imagem', async (_nome, erro, codigo) => {
      produtos.obterEditavel.mockRejectedValue(erro());
      await expect(substituir()).rejects.toMatchObject({ codigo });
      expect(midia.processar).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: produto vence entre o upload e a gravação', () => {
    it('Então ITEM_NAO_EDITAVEL, foto nova registrada como órfã e nenhum evento', async () => {
      produtos.obterEditavel.mockResolvedValueOnce(umProduto()).mockRejectedValueOnce(naoEditavel());
      await expect(substituir()).rejects.toMatchObject({ codigo: CodigoErro.ITEM_NAO_EDITAVEL });
      expect(avisos).toHaveBeenCalledWith(
        expect.objectContaining({
          evento: 'midia.arquivo_orfao',
          caminho: 't1/produto/nova.webp',
          tenantId: 't1',
        }),
      );
      expect(eventos.emit).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: remover foto', () => {
    it('Então fotoPath fica nulo, o arquivo continua no storage e o evento sai', async () => {
      const produto = umProduto();
      produtos.obterEditavel.mockResolvedValue(produto);
      const view = await service.remover('t1', 'f1', 'p1');
      expect(produtos.obterEditavel).toHaveBeenCalledWith('t1', 'f1', 'p1', HOJE, t);
      expect(produto.update).toHaveBeenCalledWith({ fotoPath: null }, { transaction: t });
      expect(view.urlFoto).toBeNull();
      expect(eventos.emit).toHaveBeenCalledWith(EVENTO, { tenantId: 't1', filialId: 'f1' });
    });
  });

  describe('Cenário: remover foto de produto sem foto', () => {
    it('Então update não é chamado, nenhum evento e urlFoto nula', async () => {
      const produto = umProduto(null);
      produtos.obterEditavel.mockResolvedValue(produto);
      expect((await service.remover('t1', 'f1', 'p1')).urlFoto).toBeNull();
      expect(produto.update).not.toHaveBeenCalled();
      expect(eventos.emit).not.toHaveBeenCalled();
    });
  });
});
