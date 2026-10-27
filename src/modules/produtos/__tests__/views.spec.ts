import type { DataISO } from '../../../common/utils/date-only';
import { categoriaView } from '../../categorias/views/categoria.view';
import type { Produto } from '../models/produto.model';
import { produtoView } from '../views/produto.view';

const HOJE = '2026-10-18' as DataISO;
const CATEGORIA = { id: 'c1', nome: 'Mercearia' };

const umProduto = (dados: Record<string, unknown> = {}) =>
  ({
    id: 'p1',
    tenantId: 't1',
    filialId: 'f1',
    categoriaId: 'c1',
    nome: 'Arroz',
    nomeNormalizado: 'arroz',
    quantidade: '5kg',
    precoPromocionalCentavos: 2199,
    precoOriginalCentavos: 2649,
    descricao: null,
    observacao: null,
    fotoPath: 'T1/produto/x.webp',
    dataInicio: '2026-10-10',
    dataLimite: '2026-10-25',
    createdAt: new Date('2026-10-10T12:00:00Z'),
    updatedAt: new Date('2026-10-11T12:00:00Z'),
    deletedAt: null,
    ...dados,
  }) as unknown as Produto;

describe('Funcionalidade: View de produto', () => {
  describe.each([
    ['P-vigente', {}, 'VIGENTE', true, false],
    ['P-agendado', { dataInicio: '2026-10-20', dataLimite: '2026-10-30' }, 'AGENDADO', true, true],
    ['P-vencido', { dataInicio: '2026-10-01', dataLimite: '2026-10-17' }, 'VENCIDO', false, false],
    ['P-excluido', { deletedAt: new Date('2026-10-15T12:00:00Z') }, 'EXCLUIDO', false, false],
  ])(
    'Esquema do Cenário: situação e flags de %s',
    (_rotulo, dados, situacao, editavel, dataInicioEditavel) => {
      it(`Então ${situacao}, editavel ${editavel} e dataInicioEditavel ${dataInicioEditavel}`, () =>
        expect(produtoView(umProduto(dados), CATEGORIA, HOJE, null)).toMatchObject({
          situacao,
          editavel,
          dataInicioEditavel,
        }));
    },
  );

  describe('Cenário: URL da foto e campos internos', () => {
    it('Então usa a URL recebida e não expõe fotoPath, tenantId nem nomeNormalizado', () => {
      const view = produtoView(umProduto(), CATEGORIA, HOJE, 'https://cdn/T1/produto/x.webp');
      expect(view.urlFoto).toBe('https://cdn/T1/produto/x.webp');
      for (const interno of ['fotoPath', 'tenantId', 'nomeNormalizado', 'categoriaId'])
        expect(view).not.toHaveProperty(interno);
    });
  });

  describe('Cenário: preços em centavos e datas', () => {
    it('Então inteiros, datas como string e timestamps ISO', () =>
      expect(produtoView(umProduto(), CATEGORIA, HOJE, null)).toMatchObject({
        categoria: CATEGORIA,
        precoPromocionalCentavos: 2199,
        precoOriginalCentavos: 2649,
        urlFoto: null,
        dataInicio: '2026-10-10',
        dataLimite: '2026-10-25',
        criadoEm: '2026-10-10T12:00:00.000Z',
        atualizadoEm: '2026-10-11T12:00:00.000Z',
        excluidoEm: null,
      }));
  });
});

describe('Funcionalidade: View de categoria', () => {
  describe('Cenário: contagens convertidas para número', () => {
    it('Então { vigentes: 12, agendados: 3, vencidos: 0 } e podeExcluir falso', () =>
      expect(
        categoriaView({
          id: 'c1',
          nome: 'Bebidas',
          vigentes: '12',
          agendados: '3',
          posicao: 4,
          vencidos: '0',
          createdAt: new Date('2026-10-18T13:02:11Z'),
          updatedAt: new Date('2026-10-18T13:02:11Z'),
        }),
      ).toMatchObject({ produtos: { vigentes: 12, agendados: 3, vencidos: 0 }, podeExcluir: false }));
  });
});
