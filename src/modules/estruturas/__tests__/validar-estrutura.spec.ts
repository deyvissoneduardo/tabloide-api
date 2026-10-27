import { validarEstrutura, type ItensDaFilial } from '../domain/validar-estrutura';

const existentes: ItensDaFilial = {
  categorias: new Set(['C1', 'C2']),
  categoriaDoProduto: new Map([
    ['P1', 'C1'],
    ['P2', 'C1'],
    ['P3', 'C2'],
  ]),
};

describe('Funcionalidade: Validação da ordem da filial (RN45)', () => {
  describe('Cenário: ordem válida', () => {
    it('Então ok com categorias C2=0, C1=1 e produtos P3=0, P2=0, P1=1', () =>
      expect(
        validarEstrutura(
          [
            { id: 'C2', produtos: ['P3'] },
            { id: 'C1', produtos: ['P2', 'P1'] },
          ],
          existentes,
        ),
      ).toEqual({
        ok: true,
        valor: {
          categorias: [
            { id: 'C2', posicao: 0 },
            { id: 'C1', posicao: 1 },
          ],
          produtos: [
            { id: 'P3', posicao: 0 },
            { id: 'P2', posicao: 0 },
            { id: 'P1', posicao: 1 },
          ],
        },
      }));
  });

  describe('Cenário: lista vazia', () => {
    it('Então ok com nenhuma posição', () =>
      expect(validarEstrutura([], existentes)).toEqual({
        ok: true,
        valor: { categorias: [], produtos: [] },
      }));
  });

  describe('Cenário: categoria desconhecida (de outra filial, de outro tenant ou excluída)', () => {
    it('Então só CATEGORIA_DESCONHECIDA, sem problemas extras dos produtos dela', () =>
      expect(validarEstrutura([{ id: 'C9', produtos: ['P9', 'P1'] }], existentes)).toEqual({
        ok: false,
        problemas: [{ tipo: 'CATEGORIA_DESCONHECIDA', id: 'C9' }],
      }));
  });

  describe('Cenário: produto de outra categoria', () => {
    it('Então PRODUTO_FORA_DA_CATEGORIA', () =>
      expect(validarEstrutura([{ id: 'C2', produtos: ['P1'] }], existentes)).toEqual({
        ok: false,
        problemas: [{ tipo: 'PRODUTO_FORA_DA_CATEGORIA', id: 'P1' }],
      }));
  });

  describe('Cenário: produto desconhecido', () => {
    it('Então PRODUTO_DESCONHECIDO', () =>
      expect(validarEstrutura([{ id: 'C1', produtos: ['P9'] }], existentes)).toEqual({
        ok: false,
        problemas: [{ tipo: 'PRODUTO_DESCONHECIDO', id: 'P9' }],
      }));
  });

  describe('Cenário: categoria repetida', () => {
    it('Então CATEGORIA_REPETIDA', () =>
      expect(
        validarEstrutura(
          [
            { id: 'C1', produtos: [] },
            { id: 'C1', produtos: [] },
          ],
          existentes,
        ),
      ).toEqual({ ok: false, problemas: [{ tipo: 'CATEGORIA_REPETIDA', id: 'C1' }] }));
  });

  describe('Cenário: produto repetido na mesma ou em outra categoria', () => {
    it('Então PRODUTO_REPETIDO na mesma categoria', () =>
      expect(validarEstrutura([{ id: 'C1', produtos: ['P1', 'P1'] }], existentes)).toEqual({
        ok: false,
        problemas: [{ tipo: 'PRODUTO_REPETIDO', id: 'P1' }],
      }));

    it('E PRODUTO_REPETIDO em outra categoria', () =>
      expect(
        validarEstrutura(
          [
            { id: 'C1', produtos: ['P1'] },
            { id: 'C2', produtos: ['P1'] },
          ],
          existentes,
        ),
      ).toEqual({ ok: false, problemas: [{ tipo: 'PRODUTO_REPETIDO', id: 'P1' }] }));
  });

  describe('Cenário: vários problemas', () => {
    it('Então todos aparecem na lista, na ordem em que foram encontrados', () =>
      expect(
        validarEstrutura(
          [
            { id: 'C1', produtos: ['P3', 'P9'] },
            { id: 'C8', produtos: [] },
            { id: 'C1', produtos: [] },
          ],
          existentes,
        ),
      ).toEqual({
        ok: false,
        problemas: [
          { tipo: 'PRODUTO_FORA_DA_CATEGORIA', id: 'P3' },
          { tipo: 'PRODUTO_DESCONHECIDO', id: 'P9' },
          { tipo: 'CATEGORIA_DESCONHECIDA', id: 'C8' },
          { tipo: 'CATEGORIA_REPETIDA', id: 'C1' },
        ],
      }));
  });

  describe('Cenário: categoria omitida', () => {
    it('Então ok, e C2 não recebe posição', () =>
      expect(validarEstrutura([{ id: 'C1', produtos: [] }], existentes)).toEqual({
        ok: true,
        valor: { categorias: [{ id: 'C1', posicao: 0 }], produtos: [] },
      }));
  });
});
