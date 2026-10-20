import { etagFraco, ifNoneMatchContem } from '../etag';

describe('Funcionalidade: ETag da página pública', () => {
  describe('Cenário: formato e estabilidade', () => {
    it('Então W/"<16 caracteres>", igual para o mesmo conteúdo e diferente para outro', () => {
      const etag = etagFraco('{"a":1}');
      expect(etag).toMatch(/^W\/"[A-Za-z0-9_-]{16}"$/);
      expect(etagFraco('{"a":1}')).toBe(etag);
      expect(etagFraco('{"a":2}')).not.toBe(etag);
    });
  });

  describe('Esquema do Cenário: If-None-Match', () => {
    it.each([
      ['W/"abc"', true],
      ['"abc"', true],
      ['W/"xyz", W/"abc"', true],
      ['*', true],
      ['W/"xyz"', false],
    ])('Dado "%s", casa = %s', (inm, casa) => expect(ifNoneMatchContem(inm, 'W/"abc"')).toBe(casa));
  });
});
