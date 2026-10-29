import { umEndereco } from '../../../../../test/factories/endereco-filial.factory';
import type { DataISO } from '../../../../common/utils/date-only';
import { StatusLojista } from '../../../lojistas/models/status-lojista';
import {
  montarAparencia,
  type PaginaPublica,
  type PanfletoRow,
  type ProdutoRow,
} from '../../domain/montar-pagina';
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
  posicao: 2,
  categoria: { id: '0192f0c1-0000-7000-8000-000000000001', nome: 'Bebidas', posicao: 1 },
  ...dados,
});

const umaPagina = (
  dados: { produtos?: ProdutoRow[]; panfleto?: PanfletoRow | null; lojista?: object } = {},
) => {
  const lojista = {
    nomeFantasia: 'Mercado Bom Preço',
    logoPath: 'logos/x.webp',
    configuracaoPagina: { cores: { primaria: '#C8102E', secundaria: '#FFD100' } } as unknown,
    sePanfleto: false,
    status: StatusLojista.ATIVO,
    ...dados.lojista,
  };
  const panfleto = dados.panfleto === undefined ? null : dados.panfleto;
  return {
    filial: {
      id: '0192f0b4-0000-7000-8000-000000000001',
      tenantId: '0192f0a1-0000-7000-8000-000000000001',
      nome: 'Centro',
      endereco: umEndereco(),
      fusoHorario: 'America/Sao_Paulo',
      lojista,
    },
    panfleto,
    categorias: [
      {
        id: '0192f0c1-0000-7000-8000-000000000001',
        nome: 'Bebidas',
        posicao: 1,
        produtos: dados.produtos ?? [umProduto()],
      },
    ],
    aparencia: montarAparencia(lojista.configuracaoPagina, panfleto),
  } as PaginaPublica;
};

const primeiroProduto = (pagina: PaginaPublica) =>
  paginaPublicaView(pagina, false, url, HOJE).estrutura.categorias[0]!.produtos[0]!;

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
      tipoArquivo: 'IMAGEM',
      imagemPath: 't/panfleto/p.webp',
      imagemLargura: 1600,
      imagemAltura: 2263,
      dataLimite,
    });

    it('Então validoAte aparece só quando há data limite', () => {
      expect(
        paginaPublicaView(umaPagina({ panfleto: panfleto('2026-10-25' as DataISO) }), false, url, HOJE)
          .panfleto,
      ).toEqual({
        tipo: 'IMAGEM',
        arquivoUrl: 'https://cdn/t/panfleto/p.webp',
        largura: 1600,
        altura: 2263,
        validoAte: '2026-10-25',
      });
      expect(
        paginaPublicaView(umaPagina({ panfleto: panfleto(null) }), false, url, HOJE).panfleto,
      ).not.toHaveProperty('validoAte');
    });
  });

  describe('Cenário: formato novo da resposta (RN44, RN45)', () => {
    it('Então traz sePanfleto e estrutura.categorias, sem categorias na raiz nem imagemUrl', () => {
      const json = paginaPublicaView(
        umaPagina({
          panfleto: {
            tipoArquivo: 'IMAGEM',
            imagemPath: 't/panfleto/p.webp',
            imagemLargura: 1,
            imagemAltura: 1,
            dataLimite: null,
          },
        }),
        true,
        url,
        HOJE,
      );
      expect(json.sePanfleto).toBe(true);
      expect(json.estrutura.categorias.map((c) => c.nome)).toEqual(['Bebidas']);
      expect(json).not.toHaveProperty('categorias');
      expect(json.panfleto).not.toHaveProperty('imagemUrl');
      expect(Object.keys(json)).toEqual([
        'lojista',
        'sePanfleto',
        'filial',
        'panfleto',
        'estrutura',
        'aparencia',
        'hoje',
      ]);
    });
  });

  describe('Cenário: panfleto em PDF (RN13)', () => {
    it('Então tipo PDF, arquivoUrl .pdf e tamanho em pontos', () =>
      expect(
        paginaPublicaView(
          umaPagina({
            panfleto: {
              tipoArquivo: 'PDF',
              imagemPath: 't/panfleto/p.pdf',
              imagemLargura: 595,
              imagemAltura: 842,
              dataLimite: null,
            },
          }),
          true,
          url,
          HOJE,
        ).panfleto,
      ).toEqual({ tipo: 'PDF', arquivoUrl: 'https://cdn/t/panfleto/p.pdf', largura: 595, altura: 842 }));
  });

  describe('Cenário: sem panfleto vigente', () => {
    it('Então panfleto é null', () =>
      expect(paginaPublicaView(umaPagina(), false, url, HOJE).panfleto).toBeNull());
  });

  describe('Cenário: identidade visual e filial (RN28)', () => {
    it('Então lojista e filial vêm como informados, com a URL do logo', () =>
      expect(paginaPublicaView(umaPagina(), false, url, HOJE)).toMatchObject({
        lojista: {
          nome: 'Mercado Bom Preço',
          logoUrl: 'https://cdn/logos/x.webp',
          corPrimaria: '#C8102E',
          corSecundaria: '#FFD100',
        },
        filial: { nome: 'Centro', endereco: umEndereco() },
        hoje: '2026-10-18',
      }));
  });

  describe('Cenário: filial sem endereço estruturado', () => {
    it('Então endereco é null', () => {
      const pagina = umaPagina();
      pagina.filial.endereco = null;
      expect(paginaPublicaView(pagina, false, url, HOJE).filial).toEqual({ nome: 'Centro', endereco: null });
    });
  });

  describe('Cenário: endereço não expõe tenantId nem timestamps do model', () => {
    it('Então só os campos do endereço saem', () => {
      const pagina = umaPagina();
      pagina.filial.endereco = { ...umEndereco(), tenantId: 't1', createdAt: new Date() } as never;
      expect(paginaPublicaView(pagina, false, url, HOJE).filial.endereco).toEqual(umEndereco());
    });
  });

  describe('Cenário: lojista sem logo nem cores', () => {
    it('Então logoUrl, corPrimaria e corSecundaria são null', () =>
      expect(
        paginaPublicaView(
          umaPagina({ lojista: { logoPath: null, configuracaoPagina: {} } }),
          false,
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
        panfleto: {
          tipoArquivo: 'IMAGEM',
          imagemPath: 'x/panfleto/p.webp',
          imagemLargura: 1,
          imagemAltura: 1,
          dataLimite: null,
        },
      });
      const json = paginaPublicaView(completa, false, url, HOJE);
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
        expect(k).not.toMatch(/(^id$|Id$|tenant|deleted|created|updated|path|fuso|status|posicao)/i);
      for (const v of valores)
        expect(String(v)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    });
  });
});

describe('Funcionalidade: Aparência na resposta pública (RN46, RN47, RN48)', () => {
  const PANFLETO: PanfletoRow = {
    tipoArquivo: 'IMAGEM',
    imagemPath: 't/panfleto/p.webp',
    imagemLargura: 1,
    imagemAltura: 1,
    dataLimite: null,
  };
  const aparencia = (configuracaoPagina: unknown, panfleto: PanfletoRow | null = null) =>
    paginaPublicaView(umaPagina({ lojista: { configuracaoPagina }, panfleto }), false, url, HOJE).aparencia;

  describe('Cenário: lojista sem configuração', () => {
    it('Então as 10 cores de hoje, nome da categoria ligado e sem banner', () =>
      expect(aparencia({})).toEqual({
        cores: {
          primaria: '#1565C0',
          secundaria: '#996B00',
          texto: '#1F1F1F',
          textoSuave: '#5C5C5C',
          fundoCartao: '#FFFFFF',
          fundoPagina: '#F3F4F6',
          neutra: '#EEEEEE',
          sobreCor: '#FFFFFF',
          fundoBanner: '#1565C0',
          categoria: '#1565C0',
        },
        exibirNomeCategoria: true,
        banner: null,
      }));
  });

  describe('Cenário: cores escolhidas', () => {
    it('Então saem exatas, e fundoBanner/categoria seguem a primária escolhida', () =>
      expect(aparencia({ cores: { primaria: '#FFD100', texto: '#112233' } }).cores).toMatchObject({
        primaria: '#FFD100',
        texto: '#112233',
        fundoBanner: '#FFD100',
        categoria: '#FFD100',
      }));

    it('E lojista.corPrimaria/corSecundaria trazem o valor cru do JSON (null = padrão)', () =>
      expect(
        paginaPublicaView(
          umaPagina({ lojista: { configuracaoPagina: { cores: { primaria: '#FFD100' } } } }),
          false,
          url,
          HOJE,
        ).lojista,
      ).toMatchObject({ corPrimaria: '#FFD100', corSecundaria: null }));
  });

  describe('Cenário: nome da categoria desligado', () => {
    it('Então exibirNomeCategoria é false', () =>
      expect(aparencia({ exibirNomeCategoria: false }).exibirNomeCategoria).toBe(false));
  });

  describe('Cenário: banner desligado', () => {
    it('Então banner é null mesmo com conteúdo', () =>
      expect(aparencia({ banner: { exibir: false, nome: 'Semana' } }).banner).toBeNull());
  });

  describe('Cenário: banner ligado com o panfleto em exibição (RN44)', () => {
    it('Então banner é null', () =>
      expect(aparencia({ banner: { exibir: true, nome: 'Semana' } }, PANFLETO).banner).toBeNull());
  });

  describe('Cenário: banner ligado sem nada', () => {
    it('Então banner é {} (só a faixa de cor)', () =>
      expect(aparencia({ banner: { exibir: true } }).banner).toEqual({}));
  });

  describe('Cenário: banner com nome, logo e foto', () => {
    it('Então URLs públicas, sem path', () =>
      expect(
        aparencia({
          banner: {
            exibir: true,
            nome: 'Semana do Hortifrúti',
            logoPath: 't/logo/l.webp',
            campanha: { tipo: 'FOTO', fotoPath: 't/banner/b.webp' },
          },
        }).banner,
      ).toEqual({
        nome: 'Semana do Hortifrúti',
        logoUrl: 'https://cdn/t/logo/l.webp',
        campanha: { tipo: 'FOTO', fotoUrl: 'https://cdn/t/banner/b.webp' },
      }));
  });

  describe('Cenário: campanha com descrição', () => {
    it('Então campanha.tipo é DESCRICAO com o texto', () =>
      expect(
        aparencia({ banner: { exibir: true, campanha: { tipo: 'DESCRICAO', descricao: 'Tudo fresco' } } })
          .banner,
      ).toEqual({ campanha: { tipo: 'DESCRICAO', descricao: 'Tudo fresco' } }));
  });

  describe('Cenário: nenhum path no bloco aparencia (RNF05)', () => {
    it('Então nenhuma chave termina em Path', () =>
      expect(
        JSON.stringify(
          aparencia({
            banner: {
              exibir: true,
              logoPath: 't/logo/l.webp',
              campanha: { tipo: 'FOTO', fotoPath: 't/banner/b.webp' },
            },
          }),
        ),
      ).not.toMatch(/Path"/));
  });
});
