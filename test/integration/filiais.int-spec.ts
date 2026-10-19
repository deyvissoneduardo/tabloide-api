import { Injectable, Module, type OnModuleInit } from '@nestjs/common';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import type { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { TenantScopeViolationError } from '../../src/database/tenant-scope.hooks';
import type { ExclusaoEmCascataFilial } from '../../src/modules/filiais/cascata/exclusao-em-cascata-filial';
import { ExclusaoEmCascataFilialRegistry } from '../../src/modules/filiais/cascata/exclusao-em-cascata-filial.registry';
import { FiliaisModule } from '../../src/modules/filiais/filiais.module';
import { Filial } from '../../src/modules/filiais/models/filial.model';
import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { criarFilial } from '../factories/filial.factory';
import { definirStatus, umLojista, type LojistaCriado } from '../factories/lojista.factory';
import { criarApp, PUBLIC_BASE_URL, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, limparBanco, type BancoDeTeste } from '../helpers/banco-de-teste';

/** Handler de cascata de teste sobre a tabela itens_teste, como os das Fases 3 e 4. */
@Injectable()
class ItensTesteCascata implements ExclusaoEmCascataFilial {
  readonly nome = 'itens_teste';
  readonly ordem = 10;
  constructor(private readonly sequelize: Sequelize) {}

  async excluirPorFilial(
    tenantId: string,
    filialId: string,
    opts: { transaction: Transaction },
  ): Promise<number> {
    const [, afetadas] = await this.sequelize.query(
      'UPDATE itens_teste SET excluido = true WHERE tenant_id = :tenantId AND filial_id = :filialId',
      { replacements: { tenantId, filialId }, transaction: opts.transaction },
    );
    return afetadas as unknown as number;
  }
}

/** Falha sob demanda, depois do handler de itens_teste, para provar o rollback. */
@Injectable()
class FalhaControlada implements ExclusaoEmCascataFilial {
  readonly nome = 'falha_controlada';
  readonly ordem = 20;
  ativa = false;

  async excluirPorFilial(): Promise<number> {
    if (this.ativa) throw new Error('falha controlada na cascata');
    return 0;
  }
}

@Module({ imports: [FiliaisModule], providers: [ItensTesteCascata, FalhaControlada] })
class CascataDeTesteModule implements OnModuleInit {
  constructor(
    private readonly registry: ExclusaoEmCascataFilialRegistry,
    private readonly itens: ItensTesteCascata,
    private readonly falha: FalhaControlada,
  ) {}

  onModuleInit(): void {
    this.registry.registrar(this.itens);
    this.registry.registrar(this.falha);
  }
}

describe('Funcionalidade: Filiais no banco real', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let lojista: LojistaCriado;
  const sql = (q: string, replacements?: Record<string, unknown>) =>
    banco.sequelize.query(q, { replacements });
  const auth = () => ({ Authorization: `Bearer ${lojista.token}` });

  beforeAll(async () => {
    banco = await iniciarBanco();
    await sql(
      'CREATE TABLE itens_teste (id serial PRIMARY KEY, tenant_id uuid, filial_id uuid, excluido boolean DEFAULT false)',
    );
    app = await criarApp(banco.url, {}, [CascataDeTesteModule]);
  });
  beforeEach(async () => {
    lojista = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
  });
  afterEach(async () => {
    app.app.get(FalhaControlada).ativa = false;
    await sql('TRUNCATE itens_teste');
    await limparBanco(banco);
  });
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  const inserirFilialSql = (campos: Record<string, unknown>) =>
    sql(
      `INSERT INTO filiais (id, tenant_id, nome, endereco, codigo_publico, deleted_at)
       VALUES (gen_random_uuid(), :tenantId, :nome, 'Rua', :codigo, :deletedAt)`,
      { tenantId: lojista.id, nome: 'Loja', codigo: 'k7Qm2xPa', deletedAt: null, ...campos },
    );

  describe('Cenário: código público único entre filiais excluídas (D1)', () => {
    it('Então o banco recusa repetir o código de uma filial excluída', async () => {
      await inserirFilialSql({ deletedAt: new Date() });
      await expect(inserirFilialSql({})).rejects.toMatchObject({
        parent: { code: '23505', constraint: 'filiais_codigo_publico_uk' },
      });
    });
  });

  describe('Cenário: formato do código no banco', () => {
    it('Então "0OIl1abc" é recusado', () =>
      expect(inserirFilialSql({ codigo: '0OIl1abc' })).rejects.toMatchObject({
        parent: { constraint: 'filiais_codigo_publico_formato_ck' },
      }));
  });

  describe('Cenário: nome vazio no banco', () => {
    it('Então "   " é recusado', () =>
      expect(inserirFilialSql({ nome: '   ' })).rejects.toMatchObject({
        parent: { constraint: 'filiais_nome_nao_vazio_ck' },
      }));
  });

  describe('Cenário: fuso padrão no banco', () => {
    it('Então fuso_horario é America/Sao_Paulo', async () => {
      await inserirFilialSql({});
      const [[linha]] = (await sql('SELECT fuso_horario FROM filiais')) as [
        { fuso_horario: string }[],
        unknown,
      ];
      expect(linha!.fuso_horario).toBe('America/Sao_Paulo');
    });
  });

  describe('Cenário: ordenação pt-BR (D11)', () => {
    it('Então "Água Fria", "avenida", "Centro", "Zona Sul"', async () => {
      for (const nome of ['Zona Sul', 'Água Fria', 'avenida', 'Centro'])
        await criarFilial(app, lojista.token, { nome });
      const resposta = await app.http().get('/v1/painel/filiais').set(auth()).expect(200);
      expect(resposta.body.itens.map((f: { nome: string }) => f.nome)).toEqual([
        'Água Fria',
        'avenida',
        'Centro',
        'Zona Sul',
      ]);
    });
  });

  describe('Cenário: fluxo HTTP completo', () => {
    it('Então criar, listar, detalhar, editar fuso e excluir respondem como esperado', async () => {
      const filial = await criarFilial(app, lojista.token, { fusoHorario: 'america/belem' });
      expect(filial).toMatchObject({
        fusoHorario: 'America/Belem',
        urlPublica: `${PUBLIC_BASE_URL}/f/${filial.codigoPublico}`,
      });

      const lista = await app.http().get('/v1/painel/filiais').set(auth()).expect(200);
      expect(lista.body).toMatchObject({ total: 1, pagina: 1, porPagina: 50 });
      await app.http().get(`/v1/painel/filiais/${filial.id}`).set(auth()).expect(200);
      const editada = await app
        .http()
        .patch(`/v1/painel/filiais/${filial.id}`)
        .set(auth())
        .send({ fusoHorario: 'America/Manaus' })
        .expect(200);
      expect(editada.body.fusoHorario).toBe('America/Manaus');
      await app.http().delete(`/v1/painel/filiais/${filial.id}`).set(auth()).expect(204);
      await app.http().get(`/v1/painel/filiais/${filial.id}`).set(auth()).expect(404);

      const [[linha]] = (await sql('SELECT deleted_at FROM filiais WHERE id = :id', { id: filial.id })) as [
        { deleted_at: Date | null }[],
        unknown,
      ];
      expect(linha!.deleted_at).not.toBeNull();

      const [auditoria] = await sql(
        `SELECT campo, valor_anterior, valor_novo FROM auditoria_alteracoes
         WHERE entidade = 'FILIAL' AND entidade_id = :id ORDER BY alterado_em, valor_anterior NULLS FIRST`,
        { id: filial.id },
      );
      expect(auditoria).toEqual([
        { campo: 'fusoHorario', valor_anterior: null, valor_novo: 'America/Belem' },
        { campo: 'fusoHorario', valor_anterior: 'America/Belem', valor_novo: 'America/Manaus' },
      ]);
    });
  });

  describe('Cenário: fuso inválido pela API', () => {
    it('Então 422 FUSO_HORARIO_INVALIDO com o campo', async () => {
      const resposta = await app
        .http()
        .post('/v1/painel/filiais')
        .set(auth())
        .send({ nome: 'C', endereco: 'R', fusoHorario: 'Marte/Olympus' });
      expect(resposta.status).toBe(422);
      expect(resposta.body.erro).toMatchObject({
        codigo: 'FUSO_HORARIO_INVALIDO',
        detalhes: { campo: 'fusoHorario' },
      });
    });
  });

  describe('Cenário: cascata bem-sucedida', () => {
    it('Então só os itens da filial excluída são marcados', async () => {
      const alvo = await criarFilial(app, lojista.token, { nome: 'Alvo' });
      const outra = await criarFilial(app, lojista.token, { nome: 'Outra' });
      await sql(
        `INSERT INTO itens_teste (tenant_id, filial_id) VALUES (:t, :alvo), (:t, :alvo), (:t, :outra)`,
        { t: lojista.id, alvo: alvo.id, outra: outra.id },
      );
      await app.http().delete(`/v1/painel/filiais/${alvo.id}`).set(auth()).expect(204);
      const [linhas] = await sql('SELECT filial_id, excluido FROM itens_teste ORDER BY id');
      expect(linhas).toEqual([
        { filial_id: alvo.id, excluido: true },
        { filial_id: alvo.id, excluido: true },
        { filial_id: outra.id, excluido: false },
      ]);
    });
  });

  describe('Cenário: cascata usa a mesma transação e faz rollback', () => {
    it('Então 500 e nem a filial nem os itens foram excluídos', async () => {
      const alvo = await criarFilial(app, lojista.token);
      await sql('INSERT INTO itens_teste (tenant_id, filial_id) VALUES (:t, :f)', {
        t: lojista.id,
        f: alvo.id,
      });
      app.app.get(FalhaControlada).ativa = true;

      const resposta = await app.http().delete(`/v1/painel/filiais/${alvo.id}`).set(auth());
      expect(resposta.status).toBe(500);
      expect(resposta.body.erro.codigo).toBe('ERRO_INTERNO');

      await app.http().get(`/v1/painel/filiais/${alvo.id}`).set(auth()).expect(200);
      const [linhas] = await sql('SELECT excluido FROM itens_teste');
      expect(linhas).toEqual([{ excluido: false }]);
    });
  });

  describe('Cenário: lojista desativado não escreve', () => {
    it('Então POST, PATCH e DELETE dão 403 e GET lista e QR Code dão 200', async () => {
      const filial = await criarFilial(app, lojista.token);
      await definirStatus(banco.sequelize, lojista.id, StatusLojista.DESATIVADO);

      for (const req of [
        () => app.http().post('/v1/painel/filiais').set(auth()).send({ nome: 'X', endereco: 'Y' }),
        () => app.http().patch(`/v1/painel/filiais/${filial.id}`).set(auth()).send({ nome: 'X' }),
        () => app.http().delete(`/v1/painel/filiais/${filial.id}`).set(auth()),
      ]) {
        const resposta = await req();
        expect(resposta.status).toBe(403);
        expect(resposta.body.erro.codigo).toBe('LOJISTA_DESATIVADO');
      }
      await app.http().get('/v1/painel/filiais').set(auth()).expect(200);
      await app.http().get(`/v1/painel/filiais/${filial.id}/qrcode`).set(auth()).expect(200);
    });
  });

  describe('Cenário: lojista aguardando ativação escreve normalmente', () => {
    it('Então 201', async () => {
      const novo = await umLojista().criar(app, banco.sequelize);
      await criarFilial(app, novo.token);
    });
  });

  describe('Cenário: QR Code decodificável', () => {
    it('Então o PNG decodifica para a URL pública da filial', async () => {
      const filial = await criarFilial(app, lojista.token);
      const resposta = await app
        .http()
        .get(`/v1/painel/filiais/${filial.id}/qrcode?formato=png`)
        .set(auth())
        .buffer(true)
        .parse((res, feito) => {
          const partes: Buffer[] = [];
          res.on('data', (p: Buffer) => partes.push(p));
          res.on('end', () => feito(null, Buffer.concat(partes)));
        })
        .expect(200);
      const png = PNG.sync.read(resposta.body as Buffer);
      expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data).toBe(
        `${PUBLIC_BASE_URL}/f/${filial.codigoPublico}`,
      );

      const etag = resposta.headers.etag as string;
      await app
        .http()
        .get(`/v1/painel/filiais/${filial.id}/qrcode?formato=png`)
        .set(auth())
        .set('If-None-Match', etag)
        .expect(304);
    });
  });

  describe('Cenário: trava de tenant no ORM', () => {
    it('Então Filial.findAll() sem tenantId lança TenantScopeViolationError', async () => {
      await expect(app.app.get(Sequelize).model(Filial).findAll()).rejects.toBeInstanceOf(
        TenantScopeViolationError,
      );
    });
  });
});
