import type { DataISO } from '../../../../common/utils/date-only';
import { StatusLojista } from '../../../lojistas/models/status-lojista';
import type { PaginaPublica, PanfletoRow, ProdutoRow } from '../../domain/montar-pagina';
import { paginaPublicaView } from '../pagina-publica.view';

const HOJE = '2026-10-18' as DataISO;
const url = (p: string) => `https://cdn/${p}`;

const umProduto = (dados: Partial<ProdutoRow> = {}): ProdutoRow => ({
  id: '0192f0d0-0000-7000-8000-000000000001',
  nome: 'Refrigerante cola',
  quantidade: null,
  precoPromocionalCentavos: 459,
  precoOriginalCentavos: null,
  descricao: null,
  observacao: null,
  fotoPath: null,
  dataLimite: null,
  categoria: { id: '0192f0c1-0000-7000-8000-000000000001', nome: 'Bebidas' },
  ...dados,
});

const umaPagina = (
  dados: { produtos?: ProdutoRow[]; panfleto?: PanfletoRow | null; lojista?: object } = {},
) =>
  ({
    filial: {
      id: '0192f0b4-0000-7000-8000-000000000001',
      tenantId: '0192f0a1-0000-7000-8000-000000000001',
      nome: 'Centro',
      endereco: 'Rua das Flores, 120',
      fusoHorario: 'America/Sao_Paulo',
      lojista: {
        nomeFantasia: 'Mercado Bom Preço',
        logoPath: 'logos/x.webp',
        corPrimaria: '#C8102E',
        corSecundaria: '#FFD100',
        status: StatusLojista.ATIVO,
        ...dados.lojista,
      },
    },
    panfleto: dados.panfleto === undefined ? null : dados.panfleto,
    categorias: [
      {
        id: '0192f0c1-0000-7000-8000-000000000001',
        nome: 'Bebidas',
        produtos: dados.produtos ?? [umProduto()],
      },
    ],
  }) as PaginaPublica;

const primeiroProduto = (pagina: PaginaPublica) =>
  paginaPublicaView(pagina, url, HOJE).categorias[0]!.produtos[0]!;

describe('Funcionalidade: View pública com campos mínimos (RN28, RN31, RN32, RNF05)', () => {
  describe('Cenário: produto com preço original exibe "de/por" (RN32)', () => {
    it('Então tem 799 e 1099', () =>
      expect(
        primeiroProduto(
          umaPagina({
            produtos: [umProduto({ precoPromocionalCentavos: 799, precoOriginalCentavos: 1099 })],
          }),
        ),
      ).toMatchObject({ precoPromocionalCentavos: 799, precoOriginalCentavos: 1099 }));
  });

  describe('Cenário: produto sem preço original nem data limite', () => {
    it('Então não tem as chaves precoOriginalCentavos nem validoAte', () => {
      const p = primeiroProduto(umaPagina());
      expect(p).not.toHaveProperty('precoOriginalCentavos');
      expect(p).not.toHaveProperty('validoAte');
    });
  });

  describe('Cenário: produto com data limite mostra validoAte (RN31)', () => {
    it('Então validoAte é "2026-10-20"', () =>
      expect(
        primeiroProduto(umaPagina({ produtos: [umProduto({ dataLimite: '2026-10-20' as DataISO })] }))
          .validoAte,
      ).toBe('2026-10-20'));
  });

  describe('Cenário: panfleto com e sem data limite (RN31)', () => {
    const panfleto = (dataLimite: DataISO | null): PanfletoRow => ({
      imagemPath: 't/panfleto/p.webp',
      imagemLargura: 1600,
      imagemAltura: 2263,
      dataLimite,
    });

    it('Então validoAte aparece só quando há data limite', () => {
      expect(
        paginaPublicaView(umaPagina({ panfleto: panfleto('2026-10-25' as DataISO) }), url, HOJE).panfleto,
      ).toEqual({
        imagemUrl: 'https://cdn/t/panfleto/p.webp',
        largura: 1600,
        altura: 2263,
        validoAte: '2026-10-25',
      });
      expect(
        paginaPublicaView(umaPagina({ panfleto: panfleto(null) }), url, HOJE).panfleto,
      ).not.toHaveProperty('validoAte');
    });
  });

  describe('Cenário: sem panfleto vigente', () => {
    it('Então panfleto é null', () => expect(paginaPublicaView(umaPagina(), url, HOJE).panfleto).toBeNull());
  });

  describe('Cenário: identidade visual e filial (RN28)', () => {
    it('Então lojista e filial vêm como informados, com a URL do logo', () =>
      expect(paginaPublicaView(umaPagina(), url, HOJE)).toMatchObject({
        lojista: {
          nome: 'Mercado Bom Preço',
          logoUrl: 'https://cdn/logos/x.webp',
          corPrimaria: '#C8102E',
          corSecundaria: '#FFD100',
        },
        filial: { nome: 'Centro', endereco: 'Rua das Flores, 120' },
        hoje: '2026-10-18',
      }));
  });

  describe('Cenário: lojista sem logo nem cores', () => {
    it('Então logoUrl, corPrimaria e corSecundaria são null', () =>
      expect(
        paginaPublicaView(
          umaPagina({ lojista: { logoPath: null, corPrimaria: null, corSecundaria: null } }),
          url,
          HOJE,
        ).lojista,
      ).toEqual({ nome: 'Mercado Bom Preço', logoUrl: null, corPrimaria: null, corSecundaria: null }));
  });

  describe('Cenário: campos opcionais vazios são omitidos', () => {
    it('Então o produto tem apenas nome e precoPromocionalCentavos', () =>
      expect(Object.keys(primeiroProduto(umaPagina())).sort()).toEqual(['nome', 'precoPromocionalCentavos']));
  });

  describe('Cenário: nenhuma informação interna é exposta (RNF05)', () => {
    it('Então nenhuma chave interna e nenhum UUID em lugar algum', () => {
      const completa = umaPagina({
        produtos: [
          umProduto({
            quantidade: '2 L',
            descricao: 'd',
            observacao: 'o',
            fotoPath: 'x/produto/f.webp',
            precoOriginalCentavos: 999,
            dataLimite: '2026-10-20' as DataISO,
          }),
        ],
        panfleto: { imagemPath: 'x/panfleto/p.webp', imagemLargura: 1, imagemAltura: 1, dataLimite: null },
      });
      const json = paginaPublicaView(completa, url, HOJE);
      const chaves: string[] = [];
      const valores: unknown[] = [];
      const percorrer = (v: unknown): void => {
        if (Array.isArray(v)) return v.forEach(percorrer);
        if (v && typeof v === 'object') {
          for (const [k, filho] of Object.entries(v)) {
            chaves.push(k);
            percorrer(filho);
          }
          return;
        }
        valores.push(v);
      };
      percorrer(json);
      for (const k of chaves)
        expect(k).not.toMatch(/(^id$|Id$|tenant|deleted|created|updated|path|fuso|status)/i);
      for (const v of valores)
        expect(String(v)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    });
  });
});
