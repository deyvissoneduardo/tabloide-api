import { contextoFalso } from '../../../../test/helpers/contexto-falso';
import { limitesDeRequisicao, rastreadorLogin, rastreadorPainel } from '../limites-de-requisicao';

describe('Funcionalidade: Limite de tentativas (RNF05)', () => {
  describe('Cenário: chave de rastreio do login por IP e e-mail', () => {
    it('Então devolve "ip:email normalizado"', () =>
      expect(rastreadorLogin({ ip: '1.2.3.4', body: { email: ' Ana@X.com ' } })).toBe('1.2.3.4:ana@x.com'));
  });

  describe('Cenário: corpo sem e-mail', () => {
    it('Então devolve "ip:"', () => expect(rastreadorLogin({ ip: '1.2.3.4', body: {} })).toBe('1.2.3.4:'));
    it('E e-mail que não é texto é ignorado', () =>
      expect(rastreadorLogin({ ip: '1.2.3.4', body: { email: 42 } })).toBe('1.2.3.4:'));
  });

  describe('Cenário: limites configurados', () => {
    const limites = limitesDeRequisicao({ LOGIN_RATE_LIMIT: 5, LOGIN_RATE_TTL_SECONDS: 900 });
    const porNome = Object.fromEntries(limites.map((l) => [l.name, l]));

    it('Então login usa o env: 5 em 15 min, com rastreio por IP + e-mail', () =>
      expect(porNome.login).toMatchObject({ limit: 5, ttl: 900_000, getTracker: rastreadorLogin }));
    it('E cadastro é 10 por hora', () =>
      expect(porNome.cadastro).toMatchObject({ limit: 10, ttl: 3_600_000 }));
    it('E admin é 10 por minuto', () => expect(porNome.admin).toMatchObject({ limit: 10, ttl: 60_000 }));
  });

  describe('Cenário: cada limite só vale na rota marcada', () => {
    const [login] = limitesDeRequisicao({ LOGIN_RATE_LIMIT: 5, LOGIN_RATE_TTL_SECONDS: 900 });

    it('Então rota sem marcação é ignorada', () => expect(login!.skipIf!(contextoFalso({}).ctx)).toBe(true));
    it('E rota marcada com @LimitarRequisicoes("login") é contada', () =>
      expect(login!.skipIf!(contextoFalso({}, { 'limite:login': true }).ctx)).toBe(false));
  });

  describe('Cenário: limites da Fase 5', () => {
    const limites = limitesDeRequisicao({
      LOGIN_RATE_LIMIT: 5,
      LOGIN_RATE_TTL_SECONDS: 900,
      PUBLICO_RATE_LIMIT_POR_MIN: 300,
      PAINEL_RATE_LIMIT_POR_MIN: 600,
    });
    const porNome = Object.fromEntries(limites.map((l) => [l.name, l]));

    it('Então a página pública é 300 por minuto, só na rota marcada', () => {
      expect(porNome.publico).toMatchObject({ limit: 300, ttl: 60_000 });
      expect(porNome.publico!.skipIf!(contextoFalso({}).ctx)).toBe(true);
      expect(porNome.publico!.skipIf!(contextoFalso({}, { 'limite:publico': true }).ctx)).toBe(false);
    });

    it('E o painel é 600 por minuto, só em /v1/painel', () => {
      expect(porNome.painel).toMatchObject({ limit: 600, ttl: 60_000, getTracker: rastreadorPainel });
      expect(porNome.painel!.skipIf!(contextoFalso({ originalUrl: '/v1/painel/filiais' }).ctx)).toBe(false);
      expect(porNome.painel!.skipIf!(contextoFalso({ originalUrl: '/v1/publico/filiais/x' }).ctx)).toBe(true);
    });

    it('E sem env explícito valem os padrões', () => {
      const padrao = limitesDeRequisicao({ LOGIN_RATE_LIMIT: 5, LOGIN_RATE_TTL_SECONDS: 900 });
      expect(padrao.map((l) => [l.name, l.limit])).toEqual(
        expect.arrayContaining([
          ['publico', 300],
          ['painel', 600],
        ]),
      );
    });
  });

  describe('Cenário: rastreio do painel', () => {
    it('Então tokens diferentes têm chaves diferentes e o token não aparece em claro', () => {
      const a = rastreadorPainel({ headers: { authorization: 'Bearer aaa' } });
      const b = rastreadorPainel({ headers: { authorization: 'Bearer bbb' } });
      expect(a).not.toBe(b);
      expect(a).not.toContain('aaa');
    });

    it('E sem token usa o IP', () =>
      expect(rastreadorPainel({ ip: '1.2.3.4', headers: {} })).toBe('ip:1.2.3.4'));
  });
});
