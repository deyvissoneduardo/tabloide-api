import { novoCache, umaPaginaPronta } from './apoio';

const T0 = new Date('2026-10-18T15:00:00Z');
const depois = (seg: number) => new Date(T0.getTime() + seg * 1000);

describe('Funcionalidade: Cache da página pública', () => {
  describe('Cenário: miss na primeira requisição', () => {
    it('Então o resultado é undefined', () => expect(novoCache().obter('k7Qm2xPa', T0)).toBeUndefined());
  });

  describe('Cenário: hit até o TTL e expiração depois', () => {
    it('Então 59 s depois é hit e 61 s depois é miss', () => {
      const cache = novoCache();
      const pagina = umaPaginaPronta();
      cache.gravar('A', pagina, 60, 0, T0);
      expect(cache.obter('A', depois(59))).toEqual({ tipo: 'positivo', pagina });
      expect(cache.obter('A', depois(61))).toBeUndefined();
    });
  });

  describe('Cenário: invalidação por filial', () => {
    it('Então só o código da filial sai do cache', () => {
      const cache = novoCache();
      cache.gravar('A', umaPaginaPronta({ filialId: 'f1' }), 60, 0, T0);
      cache.gravar('B', umaPaginaPronta({ filialId: 'f2' }), 60, 0, T0);
      cache.invalidar({ tenantId: 't1', filialId: 'f1' });
      expect(cache.obter('A', T0)).toBeUndefined();
      expect(cache.obter('B', T0)).toBeDefined();
    });
  });

  describe('Cenário: invalidação por tenant (identidade visual)', () => {
    it('Então F1 e F2 de T1 saem e F3 de T2 continua', () => {
      const cache = novoCache();
      cache.gravar('A', umaPaginaPronta({ filialId: 'f1' }), 60, 0, T0);
      cache.gravar('B', umaPaginaPronta({ filialId: 'f2' }), 60, 0, T0);
      cache.gravar('C', umaPaginaPronta({ tenantId: 't2', filialId: 'f3' }), 60, 0, T0);
      cache.invalidar({ tenantId: 't1' });
      expect([cache.obter('A', T0), cache.obter('B', T0)]).toEqual([undefined, undefined]);
      expect(cache.obter('C', T0)).toBeDefined();
    });
  });

  describe('Cenário: evento com tenant que não é o dono da filial', () => {
    it('Então nada é invalidado', () => {
      const cache = novoCache();
      cache.gravar('A', umaPaginaPronta(), 60, 0, T0);
      cache.invalidar({ tenantId: 't2', filialId: 'f1' });
      expect(cache.obter('A', T0)).toBeDefined();
      expect(cache.geracaoAtual('A')).toBe(0);
    });
  });

  describe('Cenário: evento de filial que não está em cache', () => {
    it('Então nada falha e a geração não muda', () => {
      const cache = novoCache();
      expect(() => cache.invalidar({ tenantId: 't1', filialId: 'f9' })).not.toThrow();
      expect(cache.geracaoAtual('A')).toBe(0);
    });
  });

  describe('Cenário: carga iniciada antes da invalidação não grava dado antigo', () => {
    it('Então a gravação com a geração antiga é descartada', () => {
      const cache = novoCache();
      const geracao = cache.geracaoAtual('A');
      cache.indexar('A', 't1', 'f1');
      cache.invalidar({ tenantId: 't1', filialId: 'f1' });
      cache.gravar('A', umaPaginaPronta(), 60, geracao, T0);
      expect(cache.obter('A', T0)).toBeUndefined();
      cache.gravarNegativo('A', geracao, T0);
      expect(cache.obter('A', T0)).toBeUndefined();
    });
  });

  describe('Cenário: cache negativo para 404', () => {
    it('Então 9 s depois é negativo e 11 s depois é miss', () => {
      const cache = novoCache();
      cache.gravarNegativo('zzzzzzzz', 0, T0);
      expect(cache.obter('zzzzzzzz', depois(9))).toEqual({ tipo: 'negativo' });
      expect(cache.obter('zzzzzzzz', depois(11))).toBeUndefined();
    });
  });

  describe('Cenário: single-flight', () => {
    it('Então chamadas simultâneas compartilham a mesma carga', async () => {
      const cache = novoCache();
      const carregar = jest.fn(async () => umaPaginaPronta());
      const resultados = await Promise.all(
        Array.from({ length: 50 }, () => cache.carregarUmaVez('A', carregar)),
      );
      expect(carregar).toHaveBeenCalledTimes(1);
      expect(new Set(resultados.map((r) => r.etag)).size).toBe(1);
    });

    it('E uma carga que falha libera a próxima', async () => {
      const cache = novoCache();
      await expect(cache.carregarUmaVez('A', () => Promise.reject(new Error('x')))).rejects.toThrow('x');
      await expect(cache.carregarUmaVez('A', async () => umaPaginaPronta())).resolves.toBeDefined();
    });
  });

  describe('Cenário: índices secundários são limpos quando o LRU descarta', () => {
    it('Então o evento da filial de A não referencia mais o código A', () => {
      const cache = novoCache({ max: 2 });
      cache.gravar('A', umaPaginaPronta({ filialId: 'fa' }), 60, 0, T0);
      cache.gravar('B', umaPaginaPronta({ filialId: 'fb' }), 60, 0, T0);
      cache.gravar('C', umaPaginaPronta({ filialId: 'fc' }), 60, 0, T0);
      expect(cache.obter('A', T0)).toBeUndefined();
      cache.invalidar({ tenantId: 't1', filialId: 'fa' });
      expect(cache.geracaoAtual('A')).toBe(0);
      cache.invalidar({ tenantId: 't1' });
      expect([cache.geracaoAtual('B'), cache.geracaoAtual('C')]).toEqual([1, 1]);
    });

    it('E regravar o mesmo código mantém os índices', () => {
      const cache = novoCache();
      cache.gravar('A', umaPaginaPronta(), 60, 0, T0);
      cache.gravar('A', umaPaginaPronta(), 60, 0, T0);
      cache.invalidar({ tenantId: 't1', filialId: 'f1' });
      expect(cache.geracaoAtual('A')).toBe(1);
    });
  });

  describe('Cenário: limpar', () => {
    it('Então esvazia e descarta cargas em andamento', () => {
      const cache = novoCache();
      cache.gravar('A', umaPaginaPronta(), 60, 0, T0);
      cache.limpar();
      expect(cache.tamanho).toBe(0);
      cache.gravar('A', umaPaginaPronta(), 60, 0, T0);
      expect(cache.obter('A', T0)).toBeUndefined();
    });
  });

  describe('Cenário: cache desativado por configuração', () => {
    it('Então o resultado é sempre undefined', () => {
      const cache = novoCache({ desativado: true });
      cache.gravar('A', umaPaginaPronta(), 60, 0, T0);
      cache.gravarNegativo('B', 0, T0);
      expect([cache.obter('A', T0), cache.obter('B', T0)]).toEqual([undefined, undefined]);
    });
  });
});
