import type { AppError } from '../../../../common/errors/app.error';
import { validarPrecos } from '../validar-precos';

describe('Funcionalidade: Validação de preços do produto (RN21)', () => {
  describe.each<[string, number, number | null]>([
    ['só preço promocional', 499, null],
    ['preço original maior que o promocional', 2199, 2649],
    ['preço original um centavo acima do promocional', 1000, 1001],
  ])('Cenário: %s', (_nome, promocional, original) => {
    it('Então nenhum erro é lançado', () => expect(() => validarPrecos(promocional, original)).not.toThrow());
  });

  describe('Cenário: preço original igual ao promocional', () => {
    describe('Dado preço promocional 1000 e preço original 1000', () => {
      describe('Quando valido os preços', () => {
        const executar = () => validarPrecos(1000, 1000);

        it('Então recebo PRECO_ORIGINAL_INVALIDO', () => {
          expect(executar).toThrow(expect.objectContaining({ codigo: 'PRECO_ORIGINAL_INVALIDO' }));
        });

        it('E os detalhes trazem os dois valores', () => {
          expect.assertions(1);
          try {
            executar();
          } catch (e) {
            expect((e as AppError).detalhes).toEqual({
              precoPromocionalCentavos: 1000,
              precoOriginalCentavos: 1000,
            });
          }
        });
      });
    });
  });

  describe('Cenário: preço original menor que o promocional', () => {
    it('Então recebo PRECO_ORIGINAL_INVALIDO', () =>
      expect(() => validarPrecos(1000, 999)).toThrow(
        expect.objectContaining({ codigo: 'PRECO_ORIGINAL_INVALIDO' }),
      ));
  });

  it.each([0, -1, 10.5])('Cenário: preço promocional inválido (%p) → VALIDACAO_INVALIDA', (promo) => {
    expect(() => validarPrecos(promo, null)).toThrow(
      expect.objectContaining({ codigo: 'VALIDACAO_INVALIDA' }),
    );
  });

  describe('Cenário: preço original não inteiro', () => {
    it('Então recebo VALIDACAO_INVALIDA', () =>
      expect(() => validarPrecos(1000, 1500.5)).toThrow(
        expect.objectContaining({ codigo: 'VALIDACAO_INVALIDA' }),
      ));
  });
});
