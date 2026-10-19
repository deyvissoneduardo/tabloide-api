import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as conflitoPeriodo from '../../src/modules/panfletos/domain/conflito-periodo';
import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { criarFilial, type FilialCriada } from '../factories/filial.factory';
import { definirStatus, umLojista, type LojistaCriado } from '../factories/lojista.factory';
import { criarPanfleto, enviarPanfleto } from '../factories/panfleto.factory';
import { criarApp, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, limparBanco, type BancoDeTeste } from '../helpers/banco-de-teste';
import { imagens } from '../helpers/imagens';

/** Relógio dos testes de integração: 2026-10-18T12:00Z, hoje = 2026-10-18 em São Paulo. */
describe('Funcionalidade: Panfletos no banco real', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let lojista: LojistaCriado;
  let filial: FilialCriada;
  const sql = (q: string, replacements?: Record<string, unknown>) =>
    banco.sequelize.query(q, { replacements });
  const auth = () => ({ Authorization: `Bearer ${lojista.token}` });
  const base = (filialId = filial.id) => `/v1/painel/filiais/${filialId}/panfletos`;

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
  });
  beforeEach(async () => {
    lojista = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    filial = await criarFilial(app, lojista.token);
  });
  afterEach(() => limparBanco(banco));
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  const inserirSql = (campos: {
    filialId?: string;
    inicio: string;
    limite: string | null;
    excluido?: boolean;
  }) =>
    sql(
      `INSERT INTO panfletos (id, tenant_id, filial_id, imagem_path, imagem_largura, imagem_altura, data_inicio, data_limite, deleted_at)
       VALUES (gen_random_uuid(), :t, :f, 'x.webp', 10, 10, :inicio, :limite, :deletedAt)`,
      {
        t: lojista.id,
        f: campos.filialId ?? filial.id,
        inicio: campos.inicio,
        limite: campos.limite,
        deletedAt: campos.excluido ? new Date() : null,
      },
    );
  const esperaExclusao = (promessa: Promise<unknown>) =>
    expect(promessa).rejects.toMatchObject({
      parent: { code: '23P01', constraint: 'panfletos_periodo_sem_sobreposicao' },
    });

  describe('Funcionalidade: Garantias do banco', () => {
    it('Cenário: EXCLUDE impede sobreposição mesmo sem o service', async () => {
      await inserirSql({ inicio: '2026-11-10', limite: '2026-11-20' });
      await esperaExclusao(inserirSql({ inicio: '2026-11-15', limite: '2026-11-25' }));
    });

    it('Cenário: EXCLUDE trata NULL como infinito', async () => {
      await inserirSql({ inicio: '2026-10-01', limite: null });
      await esperaExclusao(inserirSql({ inicio: '2030-01-01', limite: '2030-01-02' }));
    });

    it('Cenário: EXCLUDE inclui os extremos (mesmo dia sobrepõe)', async () => {
      await inserirSql({ inicio: '2026-11-10', limite: '2026-11-20' });
      await esperaExclusao(inserirSql({ inicio: '2026-11-20', limite: '2026-11-25' }));
    });

    it('Cenário: EXCLUDE ignora excluídos', async () => {
      await inserirSql({ inicio: '2026-11-10', limite: '2026-11-20', excluido: true });
      await expect(inserirSql({ inicio: '2026-11-10', limite: '2026-11-20' })).resolves.toBeDefined();
    });

    it('Cenário: EXCLUDE é por filial', async () => {
      const outra = await criarFilial(app, lojista.token, { nome: 'Outra' });
      await inserirSql({ inicio: '2026-11-10', limite: '2026-11-20' });
      await expect(
        inserirSql({ filialId: outra.id, inicio: '2026-11-10', limite: '2026-11-20' }),
      ).resolves.toBeDefined();
    });

    it('Cenário: CHECK de datas', () =>
      expect(inserirSql({ inicio: '2026-11-10', limite: '2026-11-01' })).rejects.toMatchObject({
        parent: { code: '23514', constraint: 'panfletos_datas_validas' },
      }));

    it('Cenário: tradução do 23P01 quando o service não detecta (corrida)', async () => {
      await criarPanfleto(app, lojista.token, filial.id, {
        dataInicio: '2026-11-01',
        dataLimite: '2026-11-10',
      });
      const espiao = jest.spyOn(conflitoPeriodo, 'encontrarConflito').mockReturnValue(null);
      const r = await enviarPanfleto(app, lojista.token, filial.id, {
        dataInicio: '2026-11-05',
        dataLimite: '2026-11-15',
      });
      expect(espiao).toHaveBeenCalled();
      espiao.mockRestore();
      expect(r.status).toBe(409);
      expect(r.body.erro.codigo).toBe('PANFLETO_PERIODO_SOBREPOSTO');
      // veio do EXCLUDE do banco: a checagem do service devolveria detalhes.conflitoCom
      expect(r.body.erro.detalhes).toBeUndefined();
    });
  });

  describe('Funcionalidade: Concorrência', () => {
    it('Cenário: dois POST simultâneos sobrepostos na mesma filial → um 201 e um 409', async () => {
      const datas = { dataInicio: '2026-11-01', dataLimite: '2026-11-10' };
      const respostas = await Promise.all([
        enviarPanfleto(app, lojista.token, filial.id, datas),
        enviarPanfleto(app, lojista.token, filial.id, datas),
      ]);
      expect(respostas.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(respostas.find((r) => r.status === 409)!.body.erro.codigo).toBe('PANFLETO_PERIODO_SOBREPOSTO');
      const [[contagem]] = (await sql('SELECT count(*)::int AS n FROM panfletos WHERE filial_id = :f', {
        f: filial.id,
      })) as [{ n: number }[], unknown];
      expect(contagem!.n).toBe(1);
    });

    it('Cenário: POST simultâneos em filiais diferentes não se bloqueiam', async () => {
      const outra = await criarFilial(app, lojista.token, { nome: 'Outra' });
      const datas = { dataInicio: '2026-11-01', dataLimite: '2026-11-10' };
      const respostas = await Promise.all([
        enviarPanfleto(app, lojista.token, filial.id, datas),
        enviarPanfleto(app, lojista.token, outra.id, datas),
      ]);
      expect(respostas.map((r) => r.status)).toEqual([201, 201]);
    });
  });

  describe('Funcionalidade: Fluxo HTTP', () => {
    it('Cenário: JPEG 4000x3000 vira WebP 2400x1800 gravado no storage', async () => {
      const r = await enviarPanfleto(app, lojista.token, filial.id, {}, await imagens.jpeg(4000, 3000));
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({
        largura: 2400,
        altura: 1800,
        situacao: 'VIGENTE',
        dataInicio: '2026-10-18',
      });
      const caminho = String(r.body.urlImagem).replace('http://localhost/v1/midia-local/', '');
      expect(caminho.startsWith(`${lojista.id}/panfleto/`)).toBe(true);
      const arquivo = readFileSync(path.join(app.midiaDir, caminho));
      expect(arquivo.subarray(8, 12).toString('ascii')).toBe('WEBP');
    });

    it('Cenário: PDF enviado como image/jpeg → 422 IMAGEM_INVALIDA', async () => {
      const r = await enviarPanfleto(app, lojista.token, filial.id, {}, imagens.pdf());
      expect(r.status).toBe(422);
      expect(r.body.erro.codigo).toBe('IMAGEM_INVALIDA');
    });

    it('Cenário: RN17 pela API', async () => {
      await criarPanfleto(app, lojista.token, filial.id);
      const r = await enviarPanfleto(app, lojista.token, filial.id, { dataInicio: '2026-11-01' });
      expect(r.status).toBe(409);
      expect(r.body.erro).toMatchObject({
        codigo: 'PANFLETO_ATUAL_SEM_DATA_LIMITE',
        detalhes: { conflitoCom: { dataInicio: '2026-10-18', dataLimite: null } },
      });
    });

    it('Cenário: lista, detalha, edita, troca imagem e exclui', async () => {
      const p = await criarPanfleto(app, lojista.token, filial.id, { dataLimite: '2026-10-20' });
      const lista = await app.http().get(base()).set(auth()).expect(200);
      expect(lista.body).toMatchObject({ total: 1, itens: [{ id: p.id, situacao: 'VIGENTE' }] });

      await app.http().get(`${base()}/${p.id}`).set(auth()).expect(200);
      const editado = await app
        .http()
        .patch(`${base()}/${p.id}`)
        .set(auth())
        .send({ dataLimite: '2026-10-25' })
        .expect(200);
      expect(editado.body.dataLimite).toBe('2026-10-25');

      const trocado = await app
        .http()
        .put(`${base()}/${p.id}/imagem`)
        .set(auth())
        .attach('imagem', await imagens.png(300, 400), { filename: 'novo.png', contentType: 'image/png' })
        .expect(200);
      expect(trocado.body.urlImagem).not.toBe(p.urlImagem);
      expect(trocado.body).toMatchObject({ largura: 300, altura: 400 });

      await app.http().delete(`${base()}/${p.id}`).set(auth()).expect(204);
      await app.http().delete(`${base()}/${p.id}`).set(auth()).expect(404);
      const excluido = await app.http().get(`${base()}/${p.id}`).set(auth()).expect(200);
      expect(excluido.body).toMatchObject({ situacao: 'EXCLUIDO', editavel: false });
      const ativos = await app.http().get(base()).set(auth()).expect(200);
      expect(ativos.body.total).toBe(0);
      const comExcluidos = await app.http().get(`${base()}?situacao=EXCLUIDO`).set(auth()).expect(200);
      expect(comExcluidos.body.total).toBe(1);
    });

    it('Cenário: edição auditada (além das linhas da criação)', async () => {
      const p = await criarPanfleto(app, lojista.token, filial.id, { dataLimite: '2026-10-20' });
      await app.http().patch(`${base()}/${p.id}`).set(auth()).send({ dataLimite: '2026-10-25' }).expect(200);
      const [linhas] = await sql(
        `SELECT campo, valor_anterior, valor_novo FROM auditoria_alteracoes
         WHERE entidade = 'PANFLETO' AND entidade_id = :id ORDER BY alterado_em, campo`,
        { id: p.id },
      );
      expect(linhas).toEqual(
        expect.arrayContaining([
          { campo: 'dataInicio', valor_anterior: null, valor_novo: '2026-10-18' },
          { campo: 'dataLimite', valor_anterior: null, valor_novo: '2026-10-20' },
          { campo: 'imagemPath', valor_anterior: null, valor_novo: expect.stringContaining('/panfleto/') },
          { campo: 'dataLimite', valor_anterior: '2026-10-20', valor_novo: '2026-10-25' },
        ]),
      );
      expect(linhas).toHaveLength(4);
    });

    it('Cenário: lojista desativado só lê', async () => {
      const p = await criarPanfleto(app, lojista.token, filial.id, { dataLimite: '2026-10-20' });
      await definirStatus(banco.sequelize, lojista.id, StatusLojista.DESATIVADO);
      const tentativas = [
        () => enviarPanfleto(app, lojista.token, filial.id, { dataInicio: '2026-12-01' }),
        () => app.http().patch(`${base()}/${p.id}`).set(auth()).send({ dataLimite: '2026-10-25' }),
        async () =>
          app
            .http()
            .put(`${base()}/${p.id}/imagem`)
            .set(auth())
            .attach('imagem', await imagens.jpeg(10, 10), { filename: 'a.jpg', contentType: 'image/jpeg' }),
        () => app.http().delete(`${base()}/${p.id}`).set(auth()),
      ];
      for (const tentar of tentativas) {
        const r = await tentar();
        expect(r.status).toBe(403);
        expect(r.body.erro.codigo).toBe('LOJISTA_DESATIVADO');
      }
      await app.http().get(base()).set(auth()).expect(200);
    });

    it('Cenário: excluir a filial exclui os panfletos e mantém os arquivos (RN12, D3.4)', async () => {
      const p = await criarPanfleto(app, lojista.token, filial.id);
      await app.http().delete(`/v1/painel/filiais/${filial.id}`).set(auth()).expect(204);
      const [[linha]] = (await sql('SELECT deleted_at FROM panfletos WHERE id = :id', { id: p.id })) as [
        { deleted_at: Date | null }[],
        unknown,
      ];
      expect(linha!.deleted_at).not.toBeNull();
      const caminho = p.urlImagem.replace('http://localhost/v1/midia-local/', '');
      expect(existsSync(path.join(app.midiaDir, caminho))).toBe(true);
    });

    it('Cenário: conflito de período não deixa arquivo órfão (D3.3)', async () => {
      await criarPanfleto(app, lojista.token, filial.id, { dataLimite: '2026-10-31' });
      const pasta = path.join(app.midiaDir, lojista.id, 'panfleto');
      const antes = readdirSync(pasta).length;
      await enviarPanfleto(app, lojista.token, filial.id, { dataLimite: '2026-10-25' });
      expect(readdirSync(pasta).length).toBe(antes);
    });

    it('Cenário: arquivos locais não são servidos fora de development', async () => {
      const p = await criarPanfleto(app, lojista.token, filial.id);
      const caminho = p.urlImagem.replace('http://localhost', '');
      await app.http().get(caminho).expect(404);
    });
  });
});
