import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { criarFilial } from '../factories/filial.factory';
import { umLojista } from '../factories/lojista.factory';
import { enviarPanfleto } from '../factories/panfleto.factory';
import { criarApp, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, type BancoDeTeste } from '../helpers/banco-de-teste';

describe('Funcionalidade: Teto de tamanho de imagem (RNF05)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url, { MAX_IMAGEM_BYTES: '100000' });
  });
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  describe('Cenário: arquivo acima de MAX_IMAGEM_BYTES', () => {
    it('Então 413 IMAGEM_MUITO_GRANDE com maxBytes, antes de processar', async () => {
      const lojista = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
      const filial = await criarFilial(app, lojista.token);
      const r = await enviarPanfleto(app, lojista.token, filial.id, {}, Buffer.alloc(200_000, 1));
      expect(r.status).toBe(413);
      expect(r.body.erro).toMatchObject({ codigo: 'IMAGEM_MUITO_GRANDE', detalhes: { maxBytes: 100000 } });
    });
  });
});
