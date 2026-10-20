import { gunzipSync } from 'node:zlib';
import { Test } from '@nestjs/testing';
import { ClockService } from '../../../../common/clock/clock.service';
import { MetricasService } from '../../../../common/observabilidade/metricas.service';
import type { DataISO } from '../../../../common/utils/date-only';
import { AppConfig } from '../../../../config/app.config';
import { StatusLojista } from '../../../lojistas/models/status-lojista';
import { MidiaService } from '../../../midia/services/midia.service';
import { PaginaPublicaCache } from '../pagina-publica.cache';
import { PaginaPublicaQuery } from '../pagina-publica.query';
import { PublicoService } from '../publico.service';
import { configCache, umaFilialPublica, umProduto } from './apoio';

const CODIGO = 'k7Qm2xPa';

describe('Funcionalidade: Obter página pública da filial (RN23, RN27–RN32, RN35, RN41)', () => {
  let service: PublicoService;
  let cache: PaginaPublicaCache;
  let metricas: MetricasService;
  const query = {
    buscarFilialPorCodigo: jest.fn(),
    buscarPanfletoVigente: jest.fn(),
    buscarProdutosVigentes: jest.fn(),
  };
  const clock = { agora: jest.fn() };
  const midia = { urlPublica: (p: string) => `https://cdn/${p}` };

  beforeEach(async () => {
    jest.resetAllMocks();
    clock.agora.mockReturnValue(new Date('2026-10-18T15:00:00Z'));
    query.buscarFilialPorCodigo.mockResolvedValue(umaFilialPublica().build());
    query.buscarPanfletoVigente.mockResolvedValue(null);
    query.buscarProdutosVigentes.mockResolvedValue([]);
    const modulo = await Test.createTestingModule({
      providers: [
        PublicoService,
        PaginaPublicaCache,
        MetricasService,
        { provide: AppConfig, useValue: configCache() },
        { provide: PaginaPublicaQuery, useValue: query },
        { provide: MidiaService, useValue: midia },
        { provide: ClockService, useValue: clock },
      ],
    }).compile();
    service = modulo.get(PublicoService);
    cache = modulo.get(PaginaPublicaCache);
    metricas = modulo.get(MetricasService);
  });

  const obter = async (codigo = CODIGO) => JSON.parse((await service.obterPagina(codigo)).corpo);
  const naoEncontrado = { codigo: 'RECURSO_NAO_ENCONTRADO', message: 'Página não encontrada.' };
  const hojeDasConsultas = () => query.buscarProdutosVigentes.mock.calls.map((c) => c[2]);

  describe('Cenário: lojista ativo recebe a página', () => {
    it('Então a página traz a filial "Centro"', async () =>
      expect((await obter()).filial.nome).toBe('Centro'));
  });

  describe.each([StatusLojista.AGUARDANDO_ATIVACAO, StatusLojista.DESATIVADO])(
    'Esquema do Cenário: lojista %s responde como inexistente',
    (status) => {
      it('Então 404 e as consultas de panfleto e produtos não rodam', async () => {
        query.buscarFilialPorCodigo.mockResolvedValue(umaFilialPublica().comStatus(status).build());
        await expect(service.obterPagina(CODIGO)).rejects.toMatchObject(naoEncontrado);
        expect(query.buscarPanfletoVigente).not.toHaveBeenCalled();
        expect(query.buscarProdutosVigentes).not.toHaveBeenCalled();
      });
    },
  );

  describe('Cenário: erro idêntico para inexistente, inativo e excluído', () => {
    it('Então as três exceções têm o mesmo código, status e mensagem', async () => {
      const erros = [];
      query.buscarFilialPorCodigo.mockResolvedValueOnce(null);
      erros.push(await service.obterPagina('zzzzzzzz').catch((e) => e));
      query.buscarFilialPorCodigo.mockResolvedValueOnce(
        umaFilialPublica().comStatus(StatusLojista.DESATIVADO).build(),
      );
      erros.push(await service.obterPagina('yyyyyyyy').catch((e) => e));
      erros.push(await service.obterPagina('abc').catch((e) => e));
      expect(new Set(erros.map((e) => JSON.stringify([e.codigo, e.status, e.message]))).size).toBe(1);
    });
  });

  describe('Cenário: código com formato inválido não toca o banco nem o cache', () => {
    it('Então 404, sem consulta e sem entrada no cache', async () => {
      await expect(service.obterPagina('abc')).rejects.toMatchObject(naoEncontrado);
      expect(query.buscarFilialPorCodigo).not.toHaveBeenCalled();
      expect(cache.tamanho).toBe(0);
    });
  });

  describe('Cenário: código inexistente vira cache negativo', () => {
    it('Então a segunda chamada não consulta o banco', async () => {
      query.buscarFilialPorCodigo.mockResolvedValue(null);
      await expect(service.obterPagina('zzzzzzzz')).rejects.toMatchObject(naoEncontrado);
      await expect(service.obterPagina('zzzzzzzz')).rejects.toMatchObject(naoEncontrado);
      expect(query.buscarFilialPorCodigo).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cenário: sem panfleto', () => {
    it('Então panfleto é null e os produtos vêm normalmente', async () => {
      query.buscarProdutosVigentes.mockResolvedValue([umProduto('Leite', 'Laticínios')]);
      const pagina = await obter();
      expect(pagina.panfleto).toBeNull();
      expect(pagina.categorias).toHaveLength(1);
    });
  });

  describe('Cenário: panfleto vigente consultado com o hoje da filial', () => {
    it('Então imagemUrl e validoAte preenchidos, consulta com (t1, f1, "2026-10-18")', async () => {
      query.buscarPanfletoVigente.mockResolvedValue({
        imagemPath: 't1/panfleto/p.webp',
        imagemLargura: 1600,
        imagemAltura: 2263,
        dataLimite: '2026-10-25',
      });
      const pagina = await obter();
      expect(pagina.panfleto).toMatchObject({
        imagemUrl: 'https://cdn/t1/panfleto/p.webp',
        validoAte: '2026-10-25',
      });
      expect(query.buscarPanfletoVigente).toHaveBeenCalledWith('t1', 'f1', '2026-10-18');
    });
  });

  describe('Cenário: produtos agrupados e ordenados, com de/por e validoAte', () => {
    it('Então "Limpeza", "Mercearia" e "Açúcar", "Água"', async () => {
      query.buscarProdutosVigentes.mockResolvedValue([
        umProduto('Água', 'Mercearia'),
        umProduto('Detergente', 'Limpeza'),
        umProduto('Açúcar', 'Mercearia', {
          precoPromocionalCentavos: 799,
          precoOriginalCentavos: 1099,
          dataLimite: '2026-10-20' as DataISO,
        }),
      ]);
      const pagina = await obter();
      expect(pagina.categorias.map((c: { nome: string }) => c.nome)).toEqual(['Limpeza', 'Mercearia']);
      expect(pagina.categorias[1].produtos).toEqual([
        {
          nome: 'Açúcar',
          precoPromocionalCentavos: 799,
          precoOriginalCentavos: 1099,
          validoAte: '2026-10-20',
        },
        { nome: 'Água', precoPromocionalCentavos: 100 },
      ]);
    });
  });

  describe.each([
    ['23:59 em São Paulo ainda é o mesmo dia', '2026-10-19T02:59:00Z', 'America/Sao_Paulo', '2026-10-18'],
    ['00:00 em São Paulo já é o dia seguinte', '2026-10-19T03:00:00Z', 'America/Sao_Paulo', '2026-10-19'],
    ['filial em Manaus usa o próprio fuso', '2026-10-19T03:30:00Z', 'America/Manaus', '2026-10-18'],
  ])('Cenário: %s', (_nome, agora, fuso, hoje) => {
    it(`Então as consultas e a resposta usam hoje = ${hoje}`, async () => {
      clock.agora.mockReturnValue(new Date(agora));
      query.buscarFilialPorCodigo.mockResolvedValue(umaFilialPublica().comFuso(fuso).build());
      expect((await obter()).hoje).toBe(hoje);
      expect(hojeDasConsultas()).toEqual([hoje]);
    });
  });

  describe('Cenário: hit no cache no mesmo dia', () => {
    it('Então a segunda chamada não consulta o banco', async () => {
      await obter();
      clock.agora.mockReturnValue(new Date('2026-10-18T15:00:30Z'));
      await obter();
      expect(query.buscarFilialPorCodigo).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cenário: entrada em cache do dia anterior é descartada na virada', () => {
    it('Então as consultas rodam de novo com hoje = "2026-10-19"', async () => {
      clock.agora.mockReturnValue(new Date('2026-10-19T02:59:50Z'));
      await obter();
      clock.agora.mockReturnValue(new Date('2026-10-19T03:00:01Z'));
      await obter();
      expect(hojeDasConsultas()).toEqual(['2026-10-18', '2026-10-19']);
    });
  });

  describe('Cenário: TTL limitado até a meia-noite', () => {
    it('Então às 23:59:30 a entrada vale 30 s e no meio do dia 60 s', async () => {
      const gravar = jest.spyOn(cache, 'gravar');
      clock.agora.mockReturnValue(new Date('2026-10-19T02:59:30Z'));
      await obter();
      clock.agora.mockReturnValue(new Date('2026-10-18T15:00:00Z'));
      await obter('k7Qm2xPb');
      expect(gravar.mock.calls.map((c) => c[2])).toEqual([30, 60]);
    });
  });

  describe('Cenário: consultas 2 e 3 em paralelo', () => {
    it('Então as duas são chamadas antes que qualquer uma resolva', async () => {
      let liberar!: () => void;
      const barreira = new Promise<void>((r) => (liberar = r));
      query.buscarPanfletoVigente.mockImplementation(async () => (await barreira, null));
      query.buscarProdutosVigentes.mockImplementation(async () => (await barreira, []));
      const pagina = service.obterPagina(CODIGO);
      await new Promise((r) => setImmediate(r));
      expect(query.buscarPanfletoVigente).toHaveBeenCalled();
      expect(query.buscarProdutosVigentes).toHaveBeenCalled();
      liberar();
      await pagina;
    });
  });

  describe('Cenário: corpo pré-serializado e ETag', () => {
    it('Então corpo é JSON válido com geradoEm e o ETag tem 16 caracteres', async () => {
      const pronta = await service.obterPagina(CODIGO);
      expect(JSON.parse(pronta.corpo)).toMatchObject({
        hoje: '2026-10-18',
        geradoEm: '2026-10-18T15:00:00.000Z',
      });
      expect(pronta.etag).toMatch(/^W\/"[A-Za-z0-9_-]{16}"$/);
      expect(gunzipSync(pronta.corpoGzip).toString()).toBe(pronta.corpo);
      expect(pronta.corpo).not.toContain('t1');
      expect(pronta.corpo).not.toContain('America/Sao_Paulo');
    });
  });

  describe('Cenário: ETag não muda só porque geradoEm mudou', () => {
    it('Então duas cargas no mesmo dia, sem mudança de dados, têm o mesmo ETag', async () => {
      const primeira = await service.obterPagina(CODIGO);
      cache.limpar();
      clock.agora.mockReturnValue(new Date('2026-10-18T16:00:00Z'));
      const segunda = await service.obterPagina(CODIGO);
      expect(segunda.corpo).not.toBe(primeira.corpo);
      expect(segunda.etag).toBe(primeira.etag);
    });
  });

  describe('Cenário: ETag muda quando o preço muda', () => {
    it('Então os ETags são diferentes', async () => {
      query.buscarProdutosVigentes.mockResolvedValueOnce([umProduto('Leite', 'L')]);
      const primeira = await service.obterPagina(CODIGO);
      cache.limpar();
      query.buscarProdutosVigentes.mockResolvedValueOnce([
        umProduto('Leite', 'L', { precoPromocionalCentavos: 99 }),
      ]);
      expect((await service.obterPagina(CODIGO)).etag).not.toBe(primeira.etag);
    });
  });

  describe('Cenário: erro inesperado na consulta não é cacheado', () => {
    it('Então o erro sobe e a próxima chamada consulta de novo', async () => {
      query.buscarProdutosVigentes.mockRejectedValueOnce(new Error('conexão'));
      await expect(service.obterPagina(CODIGO)).rejects.toThrow('conexão');
      await obter();
      expect(query.buscarFilialPorCodigo).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cenário: single-flight em requisições simultâneas', () => {
    it('Então 50 chamadas fazem 1 consulta e recebem o mesmo ETag', async () => {
      const prontas = await Promise.all(Array.from({ length: 50 }, () => service.obterPagina(CODIGO)));
      expect(query.buscarFilialPorCodigo).toHaveBeenCalledTimes(1);
      expect(new Set(prontas.map((p) => p.etag)).size).toBe(1);
      const texto = await metricas.texto();
      expect(texto).toContain('publico_cache_total{resultado="miss"} 1');
      expect(texto).toContain('publico_cache_total{resultado="hit"} 49');
    });
  });

  describe('Cenário: lojista ativado aparece após o cache negativo', () => {
    it('Então 11 s depois a página é carregada', async () => {
      query.buscarFilialPorCodigo.mockResolvedValueOnce(
        umaFilialPublica().comStatus(StatusLojista.AGUARDANDO_ATIVACAO).build(),
      );
      await expect(service.obterPagina(CODIGO)).rejects.toMatchObject(naoEncontrado);
      clock.agora.mockReturnValue(new Date('2026-10-18T15:00:11Z'));
      expect((await obter()).filial.nome).toBe('Centro');
    });
  });
});
