import { ehAcessoContavel } from '../domain/acesso-contavel';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';
const SAMSUNG =
  'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36';

describe('Funcionalidade: o que conta como acesso à página pública (RN50)', () => {
  describe('Esquema do Cenário: user-agent', () => {
    it.each([
      ['Chrome Android', CHROME_ANDROID, true],
      ['Safari iOS', SAFARI_IOS, true],
      ['Samsung Internet', SAMSUNG, true],
      ['WhatsApp', 'WhatsApp/2.23.20.0 A', false],
      ['Facebook', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', false],
      ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', false],
      [
        'HeadlessChrome',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0.0.0 Safari/537.36',
        false,
      ],
      ['k6', 'k6/0.50.0 (https://k6.io/)', false],
      ['curl', 'curl/8.4.0', false],
      ['vazio', '', false],
      ['só espaços', '   ', false],
      ['ausente', undefined, false],
    ])('Dado %s, então %s', (_nome, userAgent, esperado) =>
      expect(ehAcessoContavel({ metodo: 'GET', userAgent })).toBe(esperado),
    );
  });

  describe('Cenário: HEAD não é carregamento', () => {
    it('Então não conta', () =>
      expect(ehAcessoContavel({ metodo: 'HEAD', userAgent: CHROME_ANDROID })).toBe(false));
  });

  describe('Cenário: método em minúsculas', () => {
    it('Então "get" conta', () =>
      expect(ehAcessoContavel({ metodo: 'get', userAgent: CHROME_ANDROID })).toBe(true));
  });

  describe('Esquema do Cenário: origem', () => {
    it.each([
      ['painel', false],
      ['qualquer', true],
      [undefined, true],
      [['painel', 'x'], true],
    ])('Dado origem=%p, então %s', (origem, esperado) =>
      expect(ehAcessoContavel({ metodo: 'GET', userAgent: SAFARI_IOS, origem })).toBe(esperado),
    );
  });
});
