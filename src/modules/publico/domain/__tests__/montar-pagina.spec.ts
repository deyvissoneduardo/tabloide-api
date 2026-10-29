import { umEndereco } from '../../../../../test/factories/endereco-filial.factory';
import { montarPagina, type FilialPublicaRow, type ProdutoRow } from '../montar-pagina';
import { StatusLojista } from '../../../lojistas/models/status-lojista';

const FILIAL: FilialPublicaRow = {
  id: 'f1',
  tenantId: 't1',
  nome: 'Centro',
  endereco: umEndereco(),
  fusoHorario: 'America/Sao_Paulo',
  lojista: {
    nomeFantasia: 'M',
    logoPath: null,
    configuracaoPagina: {},
    sePanfleto: false,
    status: StatusLojista.ATIVO,
  },
};

const produto = (
  id: string,
  nome: string,
  categoria: [string, string, (number | null)?],
  posicao: number | null = null,
): ProdutoRow => ({
  id,
  nome,
  quantidade: null,
  precoPromocionalCentavos: 100,
  precoOriginalCentavos: null,
  descricao: null,
  observacao: null,
  fotoPath: null,
  dataLimite: null,
  posicao,
  categoria: { id: categoria[0], nome: categoria[1], posicao: categoria[2] ?? null },
});

const montar = (
  produtos: ProdutoRow[],
  categoriasVazias?: Array<{ id: string; nome: string; posicao: number | null }>,
) => montarPagina({ filial: FILIAL, panfleto: null, produtos, categoriasVazias });
const resumo = (p: ReturnType<typeof montar>) =>
  p.categorias.map((c) => [c.nome, c.produtos.map((x) => x.nome)]);

describe('Funcionalidade: Montagem da página pública (RN29, RN30, RN41, RN45)', () => {
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

  describe('Cenário: categorias na ordem do lojista', () => {
    it('Então "Açougue"(posição 0) vem antes de "Bebidas"(posição 1)', () =>
      expect(
        resumo(
          montar([produto('1', 'Suco', ['b', 'Bebidas', 1]), produto('2', 'Picanha', ['a', 'Açougue', 0])]),
        ),
      ).toEqual([
        ['Açougue', ['Picanha']],
        ['Bebidas', ['Suco']],
      ]));
  });

  describe('Cenário: produtos na ordem do lojista dentro da categoria', () => {
    it('Então "Suco"(0) vem antes de "Água"(1)', () =>
      expect(
        resumo(
          montar([produto('1', 'Água', ['b', 'Bebidas'], 1), produto('2', 'Suco', ['b', 'Bebidas'], 0)]),
        ),
      ).toEqual([['Bebidas', ['Suco', 'Água']]]));
  });

  describe('Cenário: não posicionados no fim, em ordem alfabética (RN30)', () => {
    it('Então posicionados primeiro e depois "Arroz", "Feijão"', () =>
      expect(
        resumo(
          montar([
            produto('1', 'Feijão', ['m', 'Mercearia']),
            produto('2', 'Zebra', ['m', 'Mercearia'], 0),
            produto('3', 'Arroz', ['m', 'Mercearia']),
            produto('4', 'X', ['a', 'Açougue']),
            produto('5', 'Y', ['z', 'Zelo', 0]),
          ]),
        ),
      ).toEqual([
        ['Zelo', ['Y']],
        ['Açougue', ['X']],
        ['Mercearia', ['Zebra', 'Arroz', 'Feijão']],
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
      expect(
        resumo(montar([produto('1', 'X', ['c1', 'Bebidas'])], [{ id: 'c9', nome: 'Vazia', posicao: 0 }])),
      ).toEqual([['Bebidas', ['X']]]));
  });
});

describe('Funcionalidade: Aparência montada junto da página (RN46, RN44)', () => {
  const comBanner = {
    ...FILIAL,
    lojista: { ...FILIAL.lojista, configuracaoPagina: { banner: { exibir: true } } },
  };

  describe('Cenário: banner ligado e página montada', () => {
    it('Então aparencia.banner existe', () =>
      expect(montarPagina({ filial: comBanner, panfleto: null, produtos: [] }).aparencia.banner).toEqual({
        nome: null,
        logoPath: null,
        campanha: null,
      }));
  });

  describe('Cenário: banner ligado e panfleto em exibição', () => {
    it('Então aparencia.banner é null', () =>
      expect(
        montarPagina({
          filial: comBanner,
          panfleto: {
            tipoArquivo: 'IMAGEM',
            imagemPath: 't/panfleto/p.webp',
            imagemLargura: 1,
            imagemAltura: 1,
            dataLimite: null,
          },
          produtos: [],
        }).aparencia.banner,
      ).toBeNull());
  });
});
