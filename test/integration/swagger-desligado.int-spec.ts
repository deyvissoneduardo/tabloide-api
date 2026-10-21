import { criarApp, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, type BancoDeTeste } from '../helpers/banco-de-teste';

describe('Funcionalidade: Documentação OpenAPI desligada', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
  });
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  describe('Cenário: SWAGGER_HABILITADO ausente', () => {
    it.each(['/docs', '/docs-json'])('Então %s responde 404 no contrato de erros', async (caminho) => {
      const resposta = await app.http().get(caminho);
      expect(resposta.status).toBe(404);
      expect(resposta.body.erro.codigo).toBe('RECURSO_NAO_ENCONTRADO');
    });
  });
});
