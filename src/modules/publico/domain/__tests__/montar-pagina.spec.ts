import { montarPagina, type FilialPublicaRow, type ProdutoRow } from '../montar-pagina';
import { StatusLojista } from '../../../lojistas/models/status-lojista';

const FILIAL: FilialPublicaRow = {
  id: 'f1',
  tenantId: 't1',
  nome: 'Centro',
  endereco: 'Rua A',
  fusoHorario: 'America/Sao_Paulo',
  lojista: {
    nomeFantasia: 'M',
    logoPath: null,
    corPrimaria: null,
    corSecundaria: null,
    status: StatusLojista.ATIVO,
  },
};

const produto = (id: string, nome: string, categoria: [string, string]): ProdutoRow => ({
  id,
  nome,
  quantidade: null,
  precoPromocionalCentavos: 100,
  precoOriginalCentavos: null,
  descricao: null,
  observacao: null,
  fotoPath: null,
  dataLimite: null,
  categoria: { id: categoria[0], nome: categoria[1] },
});

const montar = (produtos: ProdutoRow[], categoriasVazias?: Array<{ id: string; nome: string }>) =>
  montarPagina({ filial: FILIAL, panfleto: null, produtos, categoriasVazias });
const resumo = (p: ReturnType<typeof montar>) =>
  p.categorias.map((c) => [c.nome, c.produtos.map((x) => x.nome)]);

describe('Funcionalidade: Montagem da página pública (RN29, RN30, RN41)', () => {
  describe('Cenário: agrupa produtos por categoria', () => {
    it('Então 2 categorias com seus produtos', () =>
      expect(
        resumo(
          montar([
            produto('1', 'Leite', ['c1', 'Laticínios']),
            produto('2', 'Pão', ['c2', 'Padaria']),
            produto('3', 'Queijo', ['c1', 'Laticínios']),
          ]),
        ),
      ).toEqual([
        ['Laticínios', ['Leite', 'Queijo']],
        ['Padaria', ['Pão']],
      ]));
  });

  describe('Cenário: categorias e produtos em ordem alfabética pt-BR', () => {
    it('Então "Açougue", "bebidas", "Mercearia" e "abacate", "Açúcar", "Água"', () =>
      expect(
        resumo(
          montar([
            produto('1', 'Água', ['m', 'Mercearia']),
            produto('2', 'Açúcar', ['m', 'Mercearia']),
            produto('3', 'abacate', ['m', 'Mercearia']),
            produto('4', 'Suco', ['b', 'bebidas']),
            produto('5', 'Picanha', ['a', 'Açougue']),
          ]),
        ),
      ).toEqual([
        ['Açougue', ['Picanha']],
        ['bebidas', ['Suco']],
        ['Mercearia', ['abacate', 'Açúcar', 'Água']],
      ]));
  });

  describe('Cenário: desempate estável por id', () => {
    it('Então "01J..A" vem antes nas duas ordens de entrada e o resultado é idêntico', () => {
      const b = produto('01J..B', 'Arroz', ['c', 'Mercearia']);
      const a = produto('01J..A', 'Arroz', ['c', 'Mercearia']);
      const um = montar([b, a]);
      const outro = montar([a, b]);
      expect(um.categorias[0]!.produtos.map((p) => p.id)).toEqual(['01J..A', '01J..B']);
      expect(JSON.stringify(um)).toBe(JSON.stringify(outro));
    });

    it('E categorias homônimas desempatam pelo id', () => {
      const pagina = montar([produto('1', 'X', ['c2', 'Bebidas']), produto('2', 'Y', ['c1', 'Bebidas'])]);
      expect(pagina.categorias.map((c) => c.id)).toEqual(['c1', 'c2']);
    });
  });

  describe('Cenário: sem produtos vigentes', () => {
    it('Então categorias é uma lista vazia', () => expect(montar([]).categorias).toEqual([]));
  });

  describe('Cenário: categoria vazia não aparece (RN41)', () => {
    it('Então o grupo sem produtos é descartado', () =>
      expect(resumo(montar([produto('1', 'X', ['c1', 'Bebidas'])], [{ id: 'c9', nome: 'Vazia' }]))).toEqual([
        ['Bebidas', ['X']],
      ]));
  });
});
