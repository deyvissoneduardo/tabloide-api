import type { ExclusaoEmCascataFilial } from '../cascata/exclusao-em-cascata-filial';
import { ExclusaoEmCascataFilialRegistry } from '../cascata/exclusao-em-cascata-filial.registry';

const handler = (nome: string, ordem: number): ExclusaoEmCascataFilial => ({
  nome,
  ordem,
  excluirPorFilial: jest.fn(),
});

describe('Funcionalidade: Registro de handlers de exclusão em cascata (RN12)', () => {
  let registry: ExclusaoEmCascataFilialRegistry;
  beforeEach(() => {
    registry = new ExclusaoEmCascataFilialRegistry();
  });

  describe('Cenário: lista ordenada por ordem', () => {
    it('Então produtos, categorias, panfletos', () => {
      registry.registrar(handler('panfletos', 30));
      registry.registrar(handler('produtos', 10));
      registry.registrar(handler('categorias', 20));
      expect(registry.listar().map((h) => h.nome)).toEqual(['produtos', 'categorias', 'panfletos']);
    });
  });

  describe('Cenário: empate de ordem desempata por nome', () => {
    it('Então "a" antes de "b"', () => {
      registry.registrar(handler('b', 10));
      registry.registrar(handler('a', 10));
      expect(registry.listar().map((h) => h.nome)).toEqual(['a', 'b']);
    });
  });

  describe('Cenário: nome duplicado', () => {
    it('Então lança erro de programação', () => {
      registry.registrar(handler('produtos', 10));
      expect(() => registry.registrar(handler('produtos', 15))).toThrow(
        'handler de cascata duplicado: produtos',
      );
    });
  });

  describe('Cenário: listar devolve cópia', () => {
    it('Então alterar o array retornado não muda o registro', () => {
      registry.registrar(handler('produtos', 10));
      (registry.listar() as ExclusaoEmCascataFilial[]).pop();
      expect(registry.listar()).toHaveLength(1);
    });
  });

  describe('Cenário: registro vazio', () => {
    it('Então lista vazia', () => expect(registry.listar()).toEqual([]));
  });
});
