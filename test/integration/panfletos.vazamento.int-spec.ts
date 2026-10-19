import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { criarFilial } from '../factories/filial.factory';
import { umLojista } from '../factories/lojista.factory';
import { criarPanfleto, enviarPanfleto } from '../factories/panfleto.factory';
import { criarApp, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, type BancoDeTeste } from '../helpers/banco-de-teste';
import { imagens } from '../helpers/imagens';

describe('Funcionalidade: Isolamento de panfletos entre lojistas (RNF04)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let tokenA: string;
  let tokenB: string;
  let filialA: string;
  let filialB: string;
  let panfletoB: string;

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
    const a = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    const b = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    [tokenA, tokenB] = [a.token, b.token];
    filialA = (await criarFilial(app, tokenA)).id;
    filialB = (await criarFilial(app, tokenB)).id;
    panfletoB = (await criarPanfleto(app, tokenB, filialB, { dataLimite: '2026-10-25' })).id;
  });
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  const comoA = () => ({ Authorization: `Bearer ${tokenA}` });
  const panfletoDeB = async () =>
    (
      await app
        .http()
        .get(`/v1/painel/filiais/${filialB}/panfletos/${panfletoB}`)
        .set({ Authorization: `Bearer ${tokenB}` })
    ).body;

  describe('Esquema do Cenário: A não acessa o panfleto de B', () => {
    const urlB = () => `/v1/painel/filiais/${filialB}/panfletos/${panfletoB}`;
    it.each([
      ['GET detalhe', () => app.http().get(urlB()).set(comoA())],
      [
        'GET lista da filial de B',
        () => app.http().get(`/v1/painel/filiais/${filialB}/panfletos`).set(comoA()),
      ],
      ['POST na filial de B', () => enviarPanfleto(app, tokenA, filialB, { dataInicio: '2026-12-01' })],
      ['PATCH datas', () => app.http().patch(urlB()).set(comoA()).send({ dataLimite: '2026-10-30' })],
      [
        'PUT imagem',
        async () =>
          app
            .http()
            .put(`${urlB()}/imagem`)
            .set(comoA())
            .attach('imagem', await imagens.jpeg(10, 10), { filename: 'a.jpg', contentType: 'image/jpeg' }),
      ],
      ['DELETE', () => app.http().delete(urlB()).set(comoA())],
    ])('Quando A faz %s, então 404 e o panfleto de B fica intacto', async (_operacao, chamar) => {
      const antes = await panfletoDeB();
      const r = await chamar();
      expect(r.status).toBe(404);
      expect(r.body.erro.codigo).toBe('RECURSO_NAO_ENCONTRADO');
      expect(await panfletoDeB()).toEqual(antes);
    });
  });

  describe('Cenário: filial de A com id de panfleto de B', () => {
    it('Então 404', async () => {
      await app.http().get(`/v1/painel/filiais/${filialA}/panfletos/${panfletoB}`).set(comoA()).expect(404);
    });
  });
});
