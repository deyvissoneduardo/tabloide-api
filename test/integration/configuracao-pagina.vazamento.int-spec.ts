import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { criarFilial, type FilialCriada } from '../factories/filial.factory';
import { umLojista, type LojistaCriado } from '../factories/lojista.factory';
import { criarApp, ipNovo, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, type BancoDeTeste } from '../helpers/banco-de-teste';
import { imagens } from '../helpers/imagens';

/**
 * As rotas da aparência não têm id: cada lojista só alcança a própria configuração (tenant do JWT).
 * Por isso o isolamento é provado pelo efeito: nada que B faça muda o painel nem a página pública de A
 * (o descreverVazamentoEntreTenants pressupõe recurso com id e 404, que aqui não existe).
 */
describe('Funcionalidade: Isolamento da aparência da página entre lojistas (RNF04, RN46–RN48)', () => {
  const ROTA = '/v1/painel/lojista/pagina';
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let a: LojistaCriado;
  let b: LojistaCriado;
  let filialA: FilialCriada;
  const como = (lojista: LojistaCriado) => ({ Authorization: `Bearer ${lojista.token}` });
  const publicaDeA = () =>
    app
      .http()
      .get(`/v1/publico/filiais/${filialA.codigoPublico}`)
      .set('X-Forwarded-For', ipNovo())
      .expect(200);
  const painelDeA = async () => (await app.http().get(ROTA).set(como(a)).expect(200)).body;

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
    a = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    b = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    filialA = await criarFilial(app, a.token);
    await app
      .http()
      .patch(ROTA)
      .set(como(a))
      .send({ banner: { exibir: true, nome: 'De A', descricao: 'Só de A' }, cores: { primaria: '#C8102E' } })
      .expect(200);
  });
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  describe('Cenário: B lê a aparência', () => {
    it('Então recebe a própria (padrão), nunca a de A', async () => {
      const r = await app.http().get(ROTA).set(como(b)).expect(200);
      expect(r.body.banner).toEqual({ exibir: false, nome: null, urlLogo: null, campanha: null });
      expect(r.body.cores.primaria).toBeNull();
    });
  });

  describe('Cenário: B edita, envia e remove imagens na própria aparência', () => {
    it('Então o painel e a página pública de A (conteúdo e ETag) não mudam', async () => {
      const painelAntes = await painelDeA();
      const publicaAntes = await publicaDeA();

      await app
        .http()
        .patch(ROTA)
        .set(como(b))
        .send({
          banner: { exibir: false, descricao: null },
          exibirNomeCategoria: false,
          cores: { primaria: '#000000' },
        })
        .expect(200);
      await app
        .http()
        .put(`${ROTA}/banner/foto`)
        .set(como(b))
        .attach('imagem', await imagens.png(320, 180), { filename: 'b.png', contentType: 'image/png' })
        .expect(200);
      await app.http().delete(`${ROTA}/banner/foto`).set(como(b)).expect(200);
      await app.http().delete(`${ROTA}/banner/logo`).set(como(b)).expect(200);

      expect(await painelDeA()).toEqual(painelAntes);
      const publicaDepois = await publicaDeA();
      expect(publicaDepois.headers.etag).toBe(publicaAntes.headers.etag);
      expect(publicaDepois.body.aparencia).toEqual(publicaAntes.body.aparencia);
    });
  });

  describe('Cenário: B tenta apontar o tenant ou um path pelo corpo', () => {
    it.each([{ tenantId: 'x' }, { lojistaId: 'x' }, { banner: { logoPath: 'x/logo/y.webp' } }])(
      'Então 400 VALIDACAO_INVALIDA para %p e A intacto',
      async (corpo) => {
        const antes = await painelDeA();
        const r = await app.http().patch(ROTA).set(como(b)).send(corpo).expect(400);
        expect(r.body.erro.codigo).toBe('VALIDACAO_INVALIDA');
        expect(await painelDeA()).toEqual(antes);
      },
    );
  });
});
