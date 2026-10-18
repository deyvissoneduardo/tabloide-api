import { centavosParaReais, ehCentavosValido } from '../money';

describe('Funcionalidade: Valores em centavos', () => {
  describe('Cenário: centavos válidos', () => {
    it.each([0, 1, 1990, 99999999])('Então %s é aceito', (v) => expect(ehCentavosValido(v)).toBe(true));
  });

  describe('Cenário: centavos inválidos', () => {
    it.each([-1, 19.9, NaN, Infinity, '1990', null, 100000000])('Então %s é recusado', (v) =>
      expect(ehCentavosValido(v)).toBe(false),
    );
  });

  describe('Cenário: formatação em reais', () => {
    it.each([
      [1990, '19,90'],
      [5, '0,05'],
      [100, '1,00'],
      [123456, '1.234,56'],
    ])('Então %s vira "%s"', (c, esperado) => expect(centavosParaReais(c)).toBe(esperado));
  });
});
