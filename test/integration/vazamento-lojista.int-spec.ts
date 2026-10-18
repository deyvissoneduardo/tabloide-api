import { Controller, Get, Injectable, Module, Param, Patch, Post, Body } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { PATH_METADATA } from '@nestjs/common/constants';
import { TenantId } from '../../src/common/decorators/tenant-id.decorator';
import { naoEncontrado } from '../../src/common/errors/errors';
import { umLojista } from '../factories/lojista.factory';
import { criarApp, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, type BancoDeTeste } from '../helpers/banco-de-teste';
import { descreverVazamentoEntreTenants } from '../helpers/vazamento';

/** Recurso fictício de tenant para validar o próprio descreverVazamentoEntreTenants. */
@Injectable()
class NotasService {
  private readonly notas = new Map<string, { tenantId: string; texto: string }>();
  private proximo = 0;

  criar(tenantId: string, texto: string) {
    this.proximo += 1;
    const id = String(this.proximo);
    this.notas.set(id, { tenantId, texto });
    return { id };
  }

  obter(tenantId: string, id: string) {
    const nota = this.notas.get(id);
    if (!nota || nota.tenantId !== tenantId) throw naoEncontrado();
    return { id, texto: nota.texto };
  }

  editar(tenantId: string, id: string, texto: string) {
    this.obter(tenantId, id);
    this.notas.get(id)!.texto = texto;
    return this.obter(tenantId, id);
  }
}

@Controller('painel/notas-de-teste')
class NotasController {
  constructor(private readonly notas: NotasService) {}

  @Post()
  criar(@TenantId() tenantId: string, @Body() corpo: { texto: string }) {
    return this.notas.criar(tenantId, corpo.texto ?? 'nota');
  }

  @Get(':id')
  obter(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.notas.obter(tenantId, id);
  }

  @Patch(':id')
  editar(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.notas.editar(tenantId, id, 'alterada');
  }
}

@Module({ imports: [DiscoveryModule], controllers: [NotasController], providers: [NotasService] })
class NotasDeTesteModule {}

describe('Funcionalidade: Isolamento entre lojistas no painel (RN07, RNF04)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let tokenA: string;
  let tokenB: string;
  let idA: string;

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url, {}, [NotasDeTesteModule]);
    const a = await umLojista().criar(app, banco.sequelize);
    const b = await umLojista().criar(app, banco.sequelize);
    [tokenA, tokenB, idA] = [a.token, b.token, a.id];
  });
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  describe('Cenário: o token define de quem são os dados', () => {
    it('Então o token de A em GET /v1/painel/lojista devolve só os dados de A', async () => {
      const resposta = await app.http().get('/v1/painel/lojista').set('Authorization', `Bearer ${tokenA}`);
      expect(resposta.body.id).toBe(idA);
    });
  });

  describe('Cenário: nenhuma rota do painel aceita o id do lojista', () => {
    it('Então nenhum caminho de /painel tem :lojistaId ou :tenantId', () => {
      const caminhos = app.app
        .get(DiscoveryService)
        .getControllers()
        .flatMap(({ metatype }) => {
          if (!metatype) return [];
          const base = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
          const metodos = Object.getOwnPropertyNames(metatype.prototype).filter((m) => m !== 'constructor');
          return metodos.map(
            (m) => `${base}/${String(Reflect.getMetadata(PATH_METADATA, metatype.prototype[m]) ?? '')}`,
          );
        })
        .filter((c) => c.startsWith('painel'));

      expect(caminhos.length).toBeGreaterThan(0);
      for (const caminho of caminhos) expect(caminho).not.toMatch(/:(lojistaId|tenantId)/);
    });
  });

  descreverVazamentoEntreTenants(() => ({ app, tokenA, tokenB }), {
    nome: 'recurso fictício',
    criarComo: async (token) =>
      (
        await app
          .http()
          .post('/v1/painel/notas-de-teste')
          .set('Authorization', `Bearer ${token}`)
          .send({ texto: 'x' })
      ).body,
    lerComo: async (token, id) =>
      (await app.http().get(`/v1/painel/notas-de-teste/${id}`).set('Authorization', `Bearer ${token}`)).body,
    rotas: [
      { metodo: 'get', caminho: (id) => `/v1/painel/notas-de-teste/${id}` },
      { metodo: 'patch', caminho: (id) => `/v1/painel/notas-de-teste/${id}` },
    ],
  });
});
