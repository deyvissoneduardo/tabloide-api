import type { DataISO } from '../../../common/utils/date-only';
import { estruturaView, type ProdutoDaEstruturaRow } from '../views/estrutura.view';

const HOJE = '2026-10-26' as DataISO;

const produto = (dados: Partial<ProdutoDaEstruturaRow> = {}): ProdutoDaEstruturaRow => ({
  id: 'p1',
  nome: 'Banana prata',
  quantidade: 'kg',
  descricao: null,
  observacao: null,
  precoPromocionalCentavos: 499,
  precoOriginalCentavos: 699,
  fotoPath: 't1/produto/x.webp',
  dataInicio: '2026-10-20' as DataISO,
  dataLimite: '2026-11-20' as DataISO,
  ...dados,
});
const url = (caminho: string | null) => (caminho ? `https://cdn/${caminho}` : null);

describe('Funcionalidade: View da estrutura da filial (RN45)', () => {
  describe('Cenário: produto vigente com foto', () => {
    it('Então expõe os campos do contrato, com urlFoto e situação VIGENTE', () => {
      const view = estruturaView(
        [{ id: 'c1', nome: 'Hortifrúti' }],
        new Map([['c1', [produto()]]]),
        HOJE,
        url,
      );
      expect(view).toEqual({
        categorias: [
          {
            id: 'c1',
            nome: 'Hortifrúti',
            produtos: [
              {
                id: 'p1',
                nome: 'Banana prata',
                quantidade: 'kg',
                descricao: null,
                observacao: null,
                precoPromocionalCentavos: 499,
                precoOriginalCentavos: 699,
                urlFoto: 'https://cdn/t1/produto/x.webp',
                dataInicio: '2026-10-20',
                dataLimite: '2026-11-20',
                situacao: 'VIGENTE',
                editavel: true,
              },
            ],
          },
        ],
      });
    });
  });

  describe('Cenário: produto agendado sem foto nem data limite', () => {
    it('Então AGENDADO, urlFoto null e dataLimite null', () => {
      const [item] = estruturaView(
        [{ id: 'c1', nome: 'X' }],
        new Map([
          ['c1', [produto({ fotoPath: null, dataInicio: '2026-11-01' as DataISO, dataLimite: null })]],
        ]),
        HOJE,
        url,
      ).categorias[0]!.produtos;
      expect(item).toMatchObject({ situacao: 'AGENDADO', urlFoto: null, dataLimite: null, editavel: true });
    });
  });

  describe('Cenário: categoria sem produtos', () => {
    it('Então aparece com produtos vazio', () =>
      expect(estruturaView([{ id: 'c2', nome: 'Vazia' }], new Map(), HOJE, url)).toEqual({
        categorias: [{ id: 'c2', nome: 'Vazia', produtos: [] }],
      }));
  });

  describe('Cenário: nada interno vaza', () => {
    it('Então sem fotoPath, tenantId, posicao nem nomeNormalizado', () => {
      const linha = { ...produto(), tenantId: 't1', posicao: 3, nomeNormalizado: 'banana prata' };
      const json = JSON.stringify(
        estruturaView([{ id: 'c1', nome: 'X' }], new Map([['c1', [linha]]]), HOJE, url),
      );
      for (const chave of ['fotoPath', 'tenantId', 'posicao', 'nomeNormalizado'])
        expect(json).not.toContain(chave);
    });
  });
});
