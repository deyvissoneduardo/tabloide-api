import { criarApp, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, type BancoDeTeste } from '../helpers/banco-de-teste';

interface Schema {
  $ref?: string;
  nullable?: boolean;
  properties?: Record<string, Schema>;
  items?: Schema;
  allOf?: Schema[];
  format?: string;
}
interface Operacao {
  parameters?: Array<{ name: string; required: boolean }>;
  security?: Array<Record<string, string[]>>;
  requestBody?: { content: Record<string, { schema: Schema }> };
  responses: Record<string, { content?: Record<string, { examples?: Record<string, unknown> }> }>;
}
interface Spec {
  openapi: string;
  paths: Record<string, Record<string, Operacao>>;
  components: { schemas: Record<string, Schema>; securitySchemes: Record<string, unknown> };
}
interface CamadaExpress {
  route?: { path: string; methods: Record<string, boolean> };
}

/** Campos internos que nenhuma view pode expor (RNF04/RNF05). */
const CAMPOS_INTERNOS = [
  'tenantId',
  'deletedAt',
  'senhaHash',
  'imagemPath',
  'fotoPath',
  'logoPath',
  'nomeNormalizado',
];

function nomesDePropriedades(schema: Schema): string[] {
  const proprias = Object.entries(schema.properties ?? {}).flatMap(([nome, filho]) => [
    nome,
    ...nomesDePropriedades(filho),
  ]);
  const aninhadas = [schema.items, ...(schema.allOf ?? [])].filter((s): s is Schema => !!s);
  return [...proprias, ...aninhadas.flatMap(nomesDePropriedades)];
}

describe('Funcionalidade: Documentação OpenAPI', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let spec: Spec;

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url, { SWAGGER_HABILITADO: 'true' });
    spec = (await app.http().get('/docs-json')).body as Spec;
  });
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  describe('Cenário: SWAGGER_HABILITADO=true, sem token', () => {
    it('Então /docs-json devolve a spec OpenAPI 3', async () => {
      const resposta = await app.http().get('/docs-json');
      expect(resposta.status).toBe(200);
      expect(resposta.body.openapi).toMatch(/^3\./);
    });

    it('E /docs devolve o Swagger UI', async () => {
      const resposta = await app.http().get('/docs');
      expect(resposta.status).toBe(200);
      expect(resposta.headers['content-type']).toContain('text/html');
    });
  });

  describe('Cenário: cobertura das rotas', () => {
    it('Então toda rota da API, exceto admin, está na spec', () => {
      const camadas = (app.app.getHttpAdapter().getInstance() as { router: { stack: CamadaExpress[] } })
        .router.stack;
      const rotas = camadas
        .filter((c) => c.route?.path.startsWith('/v1/') && !c.route.path.startsWith('/v1/admin'))
        .flatMap((c) =>
          Object.keys(c.route!.methods).map(
            (metodo) => `${metodo} ${c.route!.path.replace(/:(\w+)/g, '{$1}')}`,
          ),
        );
      const documentadas = Object.entries(spec.paths).flatMap(([caminho, operacoes]) =>
        Object.keys(operacoes).map((metodo) => `${metodo} ${caminho}`),
      );

      expect(rotas.length).toBeGreaterThan(30);
      expect(documentadas.sort()).toEqual(rotas.sort());
    });

    it('E as rotas admin ficam fora', () =>
      expect(Object.keys(spec.paths).filter((p) => p.startsWith('/v1/admin'))).toEqual([]));
  });

  describe('Cenário: vazamento de campos internos (RNF04)', () => {
    it.each(CAMPOS_INTERNOS)('Então nenhum schema expõe %s', (campo) => {
      const nomes = Object.values(spec.components.schemas).flatMap(nomesDePropriedades);
      expect(nomes).not.toContain(campo);
    });
  });

  describe('Cenário: segurança', () => {
    it('Então o painel exige o bearer JWT', () =>
      expect(spec.paths['/v1/painel/filiais']!.get!.security).toEqual([{ jwt: [] }]));

    it('E a página pública e o login não exigem', () => {
      expect(spec.paths['/v1/publico/filiais/{codigo}']!.get!.security).toBeUndefined();
      expect(spec.paths['/v1/auth/login']!.post!.security).toBeUndefined();
    });
  });

  describe('Cenário: contrato das rotas', () => {
    it('Então o cadastro de panfleto é multipart com a imagem binária', () => {
      const corpo = spec.paths['/v1/painel/filiais/{filialId}/panfletos']!.post!.requestBody!;
      const [, arquivo] = corpo.content['multipart/form-data']!.schema.allOf!;
      expect(arquivo!.properties!.imagem!.format).toBe('binary');
    });

    it('E as datas de vigência saem como string date', () =>
      expect(spec.components.schemas.PanfletoView!.properties!.dataInicio!.format).toBe('date'));

    it('E pagina e porPagina são opcionais (têm default)', () => {
      const parametros = spec.paths['/v1/painel/filiais']!.get!.parameters!;
      expect(parametros.filter((p) => ['pagina', 'porPagina'].includes(p.name))).toEqual([
        expect.objectContaining({ name: 'pagina', required: false }),
        expect.objectContaining({ name: 'porPagina', required: false }),
      ]);
    });

    it('E o panfleto da página pública referencia o schema e aceita null', () => {
      const panfleto = spec.components.schemas.PaginaPublicaJson!.properties!.panfleto!;
      expect(panfleto.nullable).toBe(true);
      expect(JSON.stringify(panfleto)).toContain('#/components/schemas/PanfletoPublicoJson');
    });

    it('E o 409 do panfleto traz um exemplo por código de erro', () => {
      const conflito = spec.paths['/v1/painel/filiais/{filialId}/panfletos']!.post!.responses['409']!;
      expect(Object.keys(conflito.content!['application/json']!.examples!)).toEqual([
        'PANFLETO_PERIODO_SOBREPOSTO',
        'PANFLETO_ATUAL_SEM_DATA_LIMITE',
      ]);
    });
  });
});
