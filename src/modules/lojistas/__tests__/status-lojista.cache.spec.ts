import { StatusLojista } from '../models/status-lojista';
import { StatusLojistaCache } from '../services/status-lojista.cache';

describe('Funcionalidade: Cache do status do lojista', () => {
  let agora: number;
  const relogio = { now: () => agora };
  let carregar: jest.Mock<Promise<StatusLojista | null>, [string]>;
  let cache: StatusLojistaCache;

  beforeEach(() => {
    agora = 1_000;
    carregar = jest.fn().mockResolvedValue(StatusLojista.ATIVO);
    cache = new StatusLojistaCache(30_000, carregar, relogio);
  });

  describe('Cenário: primeira leitura consulta o banco', () => {
    it('Então carregar é chamado uma vez', async () => {
      await expect(cache.obter('t1')).resolves.toBe(StatusLojista.ATIVO);
      expect(carregar).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cenário: segunda leitura dentro do TTL', () => {
    it('Então carregar continua com 1 chamada', async () => {
      await cache.obter('t1');
      agora += 29_999;
      await cache.obter('t1');
      expect(carregar).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cenário: leitura após o TTL', () => {
    it('Então carregar é chamado de novo', async () => {
      await cache.obter('t1');
      carregar.mockResolvedValue(StatusLojista.DESATIVADO);
      agora += 30_001;
      await expect(cache.obter('t1')).resolves.toBe(StatusLojista.DESATIVADO);
      expect(carregar).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cenário: leituras concorrentes', () => {
    it('Então carregar é chamado uma única vez', async () => {
      await Promise.all(Array.from({ length: 10 }, () => cache.obter('t1')));
      expect(carregar).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cenário: invalidar', () => {
    it('Então a próxima leitura consulta de novo', async () => {
      await cache.obter('t1');
      cache.invalidar('t1');
      await cache.obter('t1');
      expect(carregar).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cenário: lojista inexistente não é cacheado', () => {
    it('Então carregar é chamado nas duas leituras e devolve null', async () => {
      carregar.mockResolvedValue(null);
      await expect(cache.obter('t1')).resolves.toBeNull();
      await cache.obter('t1');
      expect(carregar).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cenário: TTL zero desliga o cache', () => {
    it('Então toda leitura consulta o banco e invalidar não falha', async () => {
      const semCache = new StatusLojistaCache(0, carregar);
      await semCache.obter('t1');
      await semCache.obter('t1');
      semCache.invalidar('t1');
      expect(carregar).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cenário: relógio padrão do processo', () => {
    it('Então cacheia sem relógio injetado', async () => {
      const comRelogioReal = new StatusLojistaCache(30_000, carregar);
      await comRelogioReal.obter('t1');
      await comRelogioReal.obter('t1');
      expect(carregar).toHaveBeenCalledTimes(1);
    });
  });
});
