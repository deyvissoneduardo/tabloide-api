import { compararPorPosicao, ordenarPorPosicao, type ItemOrdenavel } from '../ordem';

const item = (nome: string, posicao: number | null, id = nome): ItemOrdenavel => ({ id, nome, posicao });
const nomes = (itens: ItemOrdenavel[]) => itens.map((i) => i.nome);

describe('Funcionalidade: Ordenação por posição (RN30, RN45)', () => {
  describe('Cenário: todos posicionados', () => {
    it('Então a saída segue 0, 1, 2', () =>
      expect(nomes(ordenarPorPosicao([item('c', 2), item('a', 0), item('b', 1)]))).toEqual(['a', 'b', 'c']));
  });

  describe('Cenário: posicionados antes dos sem posição', () => {
    it('Então "Zebra" vem antes de "Abacate"', () =>
      expect(nomes(ordenarPorPosicao([item('Abacate', null), item('Zebra', 0)]))).toEqual([
        'Zebra',
        'Abacate',
      ]));
  });

  describe('Cenário: sem posição em ordem alfabética pt-BR', () => {
    it('Então a saída é "açúcar", "Arroz", "Óleo"', () =>
      expect(
        nomes(ordenarPorPosicao([item('Óleo', null), item('Arroz', null), item('açúcar', null)])),
      ).toEqual(['açúcar', 'Arroz', 'Óleo']));
  });

  describe('Cenário: empate de posição desempata por nome e id', () => {
    it('Então o id "a" vem primeiro', () =>
      expect(ordenarPorPosicao([item('Leite', 1, 'b'), item('Leite', 1, 'a')]).map((i) => i.id)).toEqual([
        'a',
        'b',
      ]));

    it('E itens idênticos comparam como iguais', () =>
      expect(compararPorPosicao(item('Leite', 1, 'a'), item('Leite', 1, 'a'))).toBe(0));

    it('E sem posição o nome decide antes do id', () =>
      expect(nomes(ordenarPorPosicao([item('Banana', null, 'a'), item('Abacaxi', null, 'b')]))).toEqual([
        'Abacaxi',
        'Banana',
      ]));
  });

  describe('Cenário: não altera a entrada', () => {
    it('Então o array original continua na ordem original', () => {
      const entrada = [item('b', 1), item('a', 0)];
      ordenarPorPosicao(entrada);
      expect(nomes(entrada)).toEqual(['b', 'a']);
    });
  });
});
