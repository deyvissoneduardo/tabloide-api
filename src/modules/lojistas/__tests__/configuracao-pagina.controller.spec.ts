import type { INestApplication } from '@nestjs/common';
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { criarAppDeController } from '../../../../test/helpers/app-de-controller';
import { AppConfig } from '../../../config/app.config';
import { UploadImagemInterceptor } from '../../midia/interceptors/upload-imagem.interceptor';
import { ConfiguracaoPaginaController } from '../controllers/configuracao-pagina.controller';
import { ConfiguracaoPaginaService } from '../services/configuracao-pagina.service';

const ROTA = '/v1/painel/lojista/pagina';

describe('Funcionalidade: ConfiguracaoPaginaController (RN46, RN47, RN48)', () => {
  const configuracao = {
    obter: jest.fn(),
    editar: jest.fn(),
    trocarLogoBanner: jest.fn(),
    trocarFotoBanner: jest.fn(),
    removerLogoBanner: jest.fn(),
    removerFotoBanner: jest.fn(),
  };
  let app: INestApplication;
  let http: Awaited<ReturnType<typeof criarAppDeController>>['http'];

  beforeAll(async () => {
    ({ app, http } = await criarAppDeController({
      controllers: [ConfiguracaoPaginaController],
      providers: [
        { provide: ConfiguracaoPaginaService, useValue: configuracao },
        UploadImagemInterceptor,
        { provide: AppConfig, useValue: { maxImagemBytes: 1_000_000 } },
      ],
    }));
  });
  beforeEach(() => {
    jest.resetAllMocks();
    for (const metodo of Object.values(configuracao)) metodo.mockResolvedValue({ exibirNomeCategoria: true });
  });
  afterAll(() => app.close());

  const patch = (corpo: object) => http().patch(ROTA).send(corpo);
  const camposDoErro = async (corpo: object) => {
    const r = await patch(corpo).expect(400);
    expect(r.body.erro.codigo).toBe('VALIDACAO_INVALIDA');
    expect(configuracao.editar).not.toHaveBeenCalled();
    return Object.keys(r.body.erro.detalhes.campos);
  };

  describe('Cenário: GET usa o tenant do token', () => {
    it('Então obter(T1) e 200', async () => {
      await http().get(ROTA).expect(200);
      expect(configuracao.obter).toHaveBeenCalledWith('T1');
    });
  });

  describe('Cenário: PATCH normaliza cor, nome e descrição', () => {
    it('Então editar(T1, dto) com cor maiúscula, nome sem espaços duplicados e descrição aparada', async () => {
      await patch({
        banner: { exibir: true, nome: '  Semana   do  Hortifrúti ', descricao: '  Tudo fresco  ' },
        exibirNomeCategoria: false,
        cores: { texto: ' #c8102e ', neutra: null },
      }).expect(200);
      expect(configuracao.editar).toHaveBeenCalledWith('T1', {
        banner: { exibir: true, nome: 'Semana do Hortifrúti', descricao: 'Tudo fresco' },
        exibirNomeCategoria: false,
        cores: { texto: '#C8102E', neutra: null },
      });
    });
  });

  describe('Cenário: PATCH aceita null em nome e descrição', () => {
    it('Então 200', async () => {
      await patch({ banner: { nome: null, descricao: null } }).expect(200);
      expect(configuracao.editar).toHaveBeenCalledWith('T1', { banner: { nome: null, descricao: null } });
    });
  });

  describe.each<[string, object, string]>([
    ['corpo vazio', {}, 'corpo'],
    ['cor com 5 dígitos', { cores: { texto: '#12345' } }, 'cores.texto'],
    ['cor com nome', { cores: { primaria: 'red' } }, 'cores.primaria'],
    ['chave de cor desconhecida', { cores: { borda: '#123456' } }, 'cores.borda'],
    ['exibir null', { banner: { exibir: null } }, 'banner.exibir'],
    ['exibir texto', { banner: { exibir: 'sim' } }, 'banner.exibir'],
    ['exibirNomeCategoria null', { exibirNomeCategoria: null }, 'exibirNomeCategoria'],
    ['nome vazio', { banner: { nome: '   ' } }, 'banner.nome'],
    ['nome com 121', { banner: { nome: 'a'.repeat(121) } }, 'banner.nome'],
    ['descrição com 281', { banner: { descricao: 'a'.repeat(281) } }, 'banner.descricao'],
    ['banner null', { banner: null }, 'banner'],
    ['cores lista', { cores: [] }, 'cores'],
    ['path no corpo', { banner: { logoPath: 'x/logo/y.webp' } }, 'banner.logoPath'],
  ])('Cenário: PATCH com %s', (_rotulo, corpo, campo) => {
    it(`Então 400 VALIDACAO_INVALIDA em ${campo}, sem chamar o service`, async () =>
      expect(await camposDoErro(corpo)).toContain(campo));
  });

  describe.each([
    ['logo', 'trocarLogo', 'trocarLogoBanner'],
    ['foto', 'trocarFoto', 'trocarFotoBanner'],
  ] as const)('Cenário: PUT banner/%s', (caminho, handler, metodo) => {
    it('Então usa o interceptor de upload e repassa o buffer', async () => {
      expect(
        Reflect.getMetadata(INTERCEPTORS_METADATA, ConfiguracaoPaginaController.prototype[handler]),
      ).toContain(UploadImagemInterceptor);
      await http().put(`${ROTA}/banner/${caminho}`).attach('imagem', Buffer.from('png'), 'b.png').expect(200);
      expect(configuracao[metodo]).toHaveBeenCalledWith('T1', Buffer.from('png'));
    });
  });

  describe.each([
    ['logo', 'removerLogoBanner'],
    ['foto', 'removerFotoBanner'],
  ] as const)('Cenário: DELETE banner/%s', (caminho, metodo) => {
    it('Então 200 com a view', async () => {
      const r = await http().delete(`${ROTA}/banner/${caminho}`).expect(200);
      expect(r.body).toEqual({ exibirNomeCategoria: true });
      expect(configuracao[metodo]).toHaveBeenCalledWith('T1');
    });
  });
});
