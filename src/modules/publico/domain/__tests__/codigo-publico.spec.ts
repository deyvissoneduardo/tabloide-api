import { ALFABETO_CODIGO, TAMANHO_CODIGO } from '../../../filiais/services/gerador-codigo-publico';
import { codigoPublicoValido } from '../codigo-publico';

describe('Funcionalidade: Validação do formato do código público (RN39)', () => {
  it.each([
    ['válido', 'k7Qm2xPa', true],
    ['curto', 'k7Qm2xP', false],
    ['longo', 'k7Qm2xPaa', false],
    ['com caractere ambíguo "0"', 'k7Qm2x0a', false],
    ['com caractere ambíguo "l"', 'k7Qm2xla', false],
    ['com caractere ambíguo "I"', 'k7Qm2xIa', false],
    ['com símbolo', 'k7Qm2x-a', false],
    ['vazio', '', false],
    ['tentativa de injeção', "' OR 1=1--", false],
  ])('Esquema do Cenário: código %s ("%s") → %s', (_situacao, codigo, valido) =>
    expect(codigoPublicoValido(codigo)).toBe(valido),
  );

  it('Cenário: aceita todo código que o gerador da Fase 2 produz', () =>
    expect(codigoPublicoValido(ALFABETO_CODIGO.slice(0, TAMANHO_CODIGO))).toBe(true));
});
