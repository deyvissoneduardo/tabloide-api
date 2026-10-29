import {
  aplicarEdicao,
  CHAVES_COR,
  CORES_PADRAO,
  normalizarConfiguracao,
  resolverCores,
  type ConfiguracaoPaginaGuardada,
} from '../configuracao-pagina';

const PADRAO: ConfiguracaoPaginaGuardada = {
  banner: { exibir: false, nome: null, logoPath: null, campanha: null },
  exibirNomeCategoria: true,
  cores: Object.fromEntries(CHAVES_COR.map((c) => [c, null])) as ConfiguracaoPaginaGuardada['cores'],
};

const com = (parcial: {
  banner?: Partial<ConfiguracaoPaginaGuardada['banner']>;
  exibirNomeCategoria?: boolean;
  cores?: Partial<ConfiguracaoPaginaGuardada['cores']>;
}): ConfiguracaoPaginaGuardada => ({
  banner: { ...PADRAO.banner, ...parcial.banner },
  exibirNomeCategoria: parcial.exibirNomeCategoria ?? PADRAO.exibirNomeCategoria,
  cores: { ...PADRAO.cores, ...parcial.cores },
});

describe('Funcionalidade: Configuração da página do lojista (RN46, RN47, RN48)', () => {
  describe('Cenário: tabela de padrões igual à do plano (§4.4)', () => {
    it('Então as 8 cores fixas têm o visual de hoje', () =>
      expect(CORES_PADRAO).toEqual({
        primaria: '#1565C0',
        secundaria: '#996B00',
        texto: '#1F1F1F',
        textoSuave: '#5C5C5C',
        fundoCartao: '#FFFFFF',
        fundoPagina: '#F3F4F6',
        neutra: '#EEEEEE',
        sobreCor: '#FFFFFF',
      }));

    it('E são 10 chaves de cor, na ordem do contrato', () =>
      expect(CHAVES_COR).toEqual([
        'primaria',
        'secundaria',
        'texto',
        'textoSuave',
        'fundoCartao',
        'fundoPagina',
        'neutra',
        'sobreCor',
        'fundoBanner',
        'categoria',
      ]));
  });

  describe('Esquema do Cenário: normalizar o que vier do banco', () => {
    it.each<[string, unknown]>([
      ['{}', {}],
      ['null', null],
      ['texto', 'x'],
      ['lista', []],
      ['banner e cores que não são objetos', { banner: 'x', cores: 3 }],
    ])('Dado %s, então tudo é padrão', (_rotulo, bruto) =>
      expect(normalizarConfiguracao(bruto)).toEqual(PADRAO),
    );
  });

  describe('Cenário: configuração completa e válida', () => {
    it('Então é mantida como está, sem chaves extras', () => {
      const completa = {
        banner: {
          exibir: true,
          nome: 'Semana',
          logoPath: 't/logo/l.webp',
          campanha: { tipo: 'FOTO', fotoPath: 't/banner/b.webp' },
          extra: 1,
        },
        exibirNomeCategoria: false,
        cores: { primaria: '#C8102E', categoria: '#0B8043' },
        outra: true,
      };
      expect(normalizarConfiguracao(completa)).toEqual(
        com({
          banner: {
            exibir: true,
            nome: 'Semana',
            logoPath: 't/logo/l.webp',
            campanha: { tipo: 'FOTO', fotoPath: 't/banner/b.webp' },
          },
          exibirNomeCategoria: false,
          cores: { primaria: '#C8102E', categoria: '#0B8043' },
        }),
      );
    });
  });

  describe('Esquema do Cenário: cor fora do formato vira padrão (null)', () => {
    it.each<unknown>(['#c8102e', '#12345', 'red', 'C8102E', 123, null])('Dado %p', (valor) =>
      expect(normalizarConfiguracao({ cores: { texto: valor } }).cores.texto).toBeNull(),
    );
  });

  describe('Esquema do Cenário: campos do banner fora do formato', () => {
    it.each<[string, unknown]>([
      ['exibir não booleano', { exibir: 'sim' }],
      ['nome vazio', { nome: '' }],
      ['nome com 121 caracteres', { nome: 'a'.repeat(121) }],
      ['logoPath vazio', { logoPath: '' }],
      ['logoPath número', { logoPath: 1 }],
      ['campanha não objeto', { campanha: 'FOTO' }],
      ['campanha FOTO sem path', { campanha: { tipo: 'FOTO' } }],
      ['campanha FOTO com path vazio', { campanha: { tipo: 'FOTO', fotoPath: '' } }],
      ['campanha DESCRICAO vazia', { campanha: { tipo: 'DESCRICAO', descricao: '' } }],
      ['campanha DESCRICAO com 281', { campanha: { tipo: 'DESCRICAO', descricao: 'a'.repeat(281) } }],
      ['campanha de tipo desconhecido', { campanha: { tipo: 'VIDEO', descricao: 'x' } }],
    ])('Dado %s, então vira o padrão', (_rotulo, banner) =>
      expect(normalizarConfiguracao({ banner }).banner).toEqual(PADRAO.banner),
    );

    it('E nome com 120 e descrição com 280 são aceitos', () =>
      expect(
        normalizarConfiguracao({
          banner: { nome: 'a'.repeat(120), campanha: { tipo: 'DESCRICAO', descricao: 'b'.repeat(280) } },
        }).banner,
      ).toMatchObject({
        nome: 'a'.repeat(120),
        campanha: { tipo: 'DESCRICAO', descricao: 'b'.repeat(280) },
      }));
  });

  describe('Cenário: exibirNomeCategoria só desliga com false', () => {
    it('Então "false" (texto) mantém ligado', () =>
      expect(normalizarConfiguracao({ exibirNomeCategoria: 'false' }).exibirNomeCategoria).toBe(true));
  });

  describe('Cenário: resolver cores sem escolha', () => {
    it('Então os padrões, e fundoBanner/categoria iguais à primária padrão', () =>
      expect(resolverCores(PADRAO.cores)).toEqual({
        ...CORES_PADRAO,
        fundoBanner: '#1565C0',
        categoria: '#1565C0',
      }));
  });

  describe('Cenário: resolver com primária escolhida', () => {
    it('Então fundoBanner e categoria seguem a primária escolhida, sem ajuste de contraste', () =>
      expect(resolverCores(com({ cores: { primaria: '#FFD100' } }).cores)).toMatchObject({
        primaria: '#FFD100',
        fundoBanner: '#FFD100',
        categoria: '#FFD100',
      }));
  });

  describe('Cenário: resolver com todas as 10 escolhidas', () => {
    it('Então cada uma sai exata', () => {
      const cores = Object.fromEntries(
        CHAVES_COR.map((c, i) => [c, `#00000${i}`]),
      ) as ConfiguracaoPaginaGuardada['cores'];
      expect(resolverCores(cores)).toEqual(cores);
    });
  });

  describe('Funcionalidade: aplicar edição', () => {
    const FOTO = { tipo: 'FOTO', fotoPath: 't/banner/b.webp' } as const;
    const DESCRICAO = { tipo: 'DESCRICAO', descricao: 'Tudo fresco' } as const;

    describe('Cenário: edição vazia', () => {
      it('Então nada muda e o original não é alterado', () => {
        const atual = com({
          banner: { exibir: true, nome: 'A', campanha: FOTO },
          cores: { texto: '#112233' },
        });
        const copia = structuredClone(atual);
        expect(aplicarEdicao(atual, {})).toEqual(copia);
        expect(atual).toEqual(copia);
      });
    });

    describe('Cenário: campos ausentes (undefined) mantêm o valor', () => {
      it('Então só o informado muda', () =>
        expect(
          aplicarEdicao(com({ banner: { nome: 'A' }, cores: { texto: '#112233' } }), {
            banner: { exibir: true, nome: undefined },
            cores: { neutra: '#ABCDEF', texto: undefined },
          }),
        ).toEqual(
          com({ banner: { exibir: true, nome: 'A' }, cores: { texto: '#112233', neutra: '#ABCDEF' } }),
        ));
    });

    describe('Cenário: null volta cor ao padrão e remove o nome', () => {
      it('Então cores.texto e banner.nome viram null', () =>
        expect(
          aplicarEdicao(com({ banner: { nome: 'A' }, cores: { texto: '#112233' } }), {
            banner: { nome: null },
            cores: { texto: null },
          }),
        ).toEqual(PADRAO));
    });

    describe('Cenário: exibirNomeCategoria', () => {
      it('Então desliga', () =>
        expect(aplicarEdicao(PADRAO, { exibirNomeCategoria: false }).exibirNomeCategoria).toBe(false));
    });

    describe('Cenário: descrição substitui a foto', () => {
      it('Então campanha DESCRICAO', () =>
        expect(
          aplicarEdicao(com({ banner: { campanha: FOTO } }), { banner: { descricao: 'Tudo fresco' } }).banner
            .campanha,
        ).toEqual(DESCRICAO));
    });

    describe('Cenário: descricao null com FOTO', () => {
      it('Então a foto continua', () =>
        expect(
          aplicarEdicao(com({ banner: { campanha: FOTO } }), { banner: { descricao: null } }).banner.campanha,
        ).toEqual(FOTO));
    });

    describe('Cenário: descricao null com DESCRICAO', () => {
      it('Então fica sem campanha', () =>
        expect(
          aplicarEdicao(com({ banner: { campanha: DESCRICAO } }), { banner: { descricao: null } }).banner
            .campanha,
        ).toBeNull());
    });

    describe('Cenário: foto substitui a descrição', () => {
      it('Então campanha FOTO', () =>
        expect(
          aplicarEdicao(com({ banner: { campanha: DESCRICAO } }), { banner: { fotoPath: 't/banner/b.webp' } })
            .banner.campanha,
        ).toEqual(FOTO));
    });

    describe('Cenário: remover foto', () => {
      it('Então com FOTO fica sem campanha; com DESCRICAO nada muda', () => {
        expect(
          aplicarEdicao(com({ banner: { campanha: FOTO } }), { banner: { fotoPath: null } }).banner.campanha,
        ).toBeNull();
        expect(
          aplicarEdicao(com({ banner: { campanha: DESCRICAO } }), { banner: { fotoPath: null } }).banner
            .campanha,
        ).toEqual(DESCRICAO);
      });
    });

    describe('Cenário: logo do banner', () => {
      it('Então grava e remove o logoPath', () => {
        const comLogo = aplicarEdicao(PADRAO, { banner: { logoPath: 't/logo/l.webp' } });
        expect(comLogo.banner.logoPath).toBe('t/logo/l.webp');
        expect(aplicarEdicao(comLogo, { banner: { logoPath: null } }).banner.logoPath).toBeNull();
      });
    });
  });
});
