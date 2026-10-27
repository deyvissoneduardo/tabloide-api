import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { criarCategoria } from '../factories/categoria.factory';
import { criarFilial } from '../factories/filial.factory';
import { definirStatus, umLojista, type LojistaCriado } from '../factories/lojista.factory';
import { criarProduto, inserirProduto } from '../factories/produto.factory';
import { criarApp, type AppDeTeste } from '../helpers/app-de-teste';
import { encerrarBanco, iniciarBanco, type BancoDeTeste } from '../helpers/banco-de-teste';

interface EstruturaJson {
  categorias: Array<{
    id: string;
    nome: string;
    produtos: Array<{ id: string; nome: string; situacao: string }>;
  }>;
}

describe('Funcionalidade: Estrutura da filial pelo HTTP (RN45)', () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let lojista: LojistaCriado;
  let filial: string;
  let bebidas: string;
  let acougue: string;
  let suco: string;
  let agua: string;
  let picanha: string;
  let vencido: string;
  let excluido: string;

  beforeAll(async () => {
    banco = await iniciarBanco();
    app = await criarApp(banco.url);
    lojista = await umLojista().comStatus(StatusLojista.ATIVO).criar(app, banco.sequelize);
    filial = (await criarFilial(app, lojista.token)).id;
    bebidas = (await criarCategoria(app, lojista.token, filial, 'Bebidas')).id;
    acougue = (await criarCategoria(app, lojista.token, filial, 'Açougue')).id;
    suco = (await criarProduto(app, lojista.token, filial, bebidas, { nome: 'Suco' })).id;
    agua = (await criarProduto(app, lojista.token, filial, bebidas, { nome: 'Água' })).id;
    picanha = (await criarProduto(app, lojista.token, filial, acougue, { nome: 'Picanha' })).id;
    await criarProduto(app, lojista.token, filial, bebidas, { nome: 'Cerveja', dataInicio: '2026-10-25' });
    const base = { tenantId: lojista.id, filialId: filial, categoriaId: bebidas };
    vencido = await inserirProduto(banco.sequelize, {
      ...base,
      nome: 'Vencido',
      inicio: '2026-10-01',
      limite: '2026-10-10',
    });
    excluido = await inserirProduto(banco.sequelize, {
      ...base,
      nome: 'Excluído',
      inicio: '2026-10-01',
      limite: null,
      excluido: true,
    });
  });
  afterAll(async () => {
    await app?.fechar();
    await encerrarBanco(banco);
  });

  const auth = () => ({ Authorization: `Bearer ${lojista.token}` });
  const url = () => `/v1/painel/filiais/${filial}/estrutura`;
  const obter = async (): Promise<EstruturaJson> =>
    (await app.http().get(url()).set(auth()).expect(200)).body;
  const salvar = (corpo: object) => app.http().put(url()).set(auth()).send(corpo);
  const resumo = (e: EstruturaJson) => e.categorias.map((c) => [c.nome, c.produtos.map((p) => p.nome)]);
  const limpar = () => salvar({ categorias: [] }).expect(200);

  describe('Cenário: GET devolve todas as categorias e só vigentes/agendados, em ordem alfabética', () => {
    it('Então "Açougue" e "Bebidas", sem vencido nem excluído', async () => {
      await limpar();
      const estrutura = await obter();
      expect(resumo(estrutura)).toEqual([
        ['Açougue', ['Picanha']],
        ['Bebidas', ['Água', 'Cerveja', 'Suco']],
      ]);
      expect(estrutura.categorias[1]!.produtos.find((p) => p.nome === 'Cerveja')!.situacao).toBe('AGENDADO');
    });
  });

  describe('Cenário: PUT grava a ordem e o GET seguinte devolve na nova ordem', () => {
    it('Então "Bebidas" primeiro, com "Suco" antes de "Água"', async () => {
      const resposta = await salvar({
        categorias: [
          { id: bebidas, produtos: [suco, agua] },
          { id: acougue, produtos: [picanha] },
        ],
      }).expect(200);
      const esperado = [
        ['Bebidas', ['Suco', 'Água', 'Cerveja']],
        ['Açougue', ['Picanha']],
      ];
      expect(resumo(resposta.body)).toEqual(esperado);
      expect(resumo(await obter())).toEqual(esperado);
    });
  });

  describe('Cenário: PUT não muda atualizadoEm dos produtos', () => {
    it('Então atualizadoEm é o mesmo antes e depois', async () => {
      const ler = async () =>
        (await app.http().get(`/v1/painel/filiais/${filial}/produtos/${suco}`).set(auth()).expect(200)).body
          .atualizadoEm;
      const antes = await ler();
      await salvar({ categorias: [{ id: bebidas, produtos: [agua, suco] }] }).expect(200);
      expect(await ler()).toBe(antes);
    });
  });

  describe('Cenário: PUT com produto excluído', () => {
    it('Então 422 ESTRUTURA_INVALIDA com PRODUTO_DESCONHECIDO', async () => {
      const resposta = await salvar({ categorias: [{ id: bebidas, produtos: [excluido] }] }).expect(422);
      expect(resposta.body.erro.codigo).toBe('ESTRUTURA_INVALIDA');
      expect(resposta.body.erro.detalhes.problemas).toEqual([{ tipo: 'PRODUTO_DESCONHECIDO', id: excluido }]);
    });
  });

  describe('Cenário: PUT com produto vencido é aceito', () => {
    it('Então 200 e o vencido não aparece', async () => {
      const resposta = await salvar({ categorias: [{ id: bebidas, produtos: [vencido, suco] }] }).expect(200);
      expect(JSON.stringify(resposta.body)).not.toContain('Vencido');
    });
  });

  describe('Cenário: PUT com produto na categoria errada', () => {
    it('Então 422 com PRODUTO_FORA_DA_CATEGORIA', async () => {
      const resposta = await salvar({ categorias: [{ id: acougue, produtos: [suco] }] }).expect(422);
      expect(resposta.body.erro.detalhes.problemas).toEqual([
        { tipo: 'PRODUTO_FORA_DA_CATEGORIA', id: suco },
      ]);
    });
  });

  describe('Cenário: PUT com ids repetidos', () => {
    it('Então 422 com CATEGORIA_REPETIDA e PRODUTO_REPETIDO', async () => {
      const resposta = await salvar({
        categorias: [
          { id: bebidas, produtos: [suco, suco] },
          { id: bebidas, produtos: [] },
        ],
      }).expect(422);
      expect(resposta.body.erro.detalhes.problemas).toEqual([
        { tipo: 'PRODUTO_REPETIDO', id: suco },
        { tipo: 'CATEGORIA_REPETIDA', id: bebidas },
      ]);
    });
  });

  describe('Cenário: PUT com id que não é UUID', () => {
    it('Então 400 VALIDACAO_INVALIDA', async () => {
      const resposta = await salvar({ categorias: [{ id: 'abc', produtos: [] }] }).expect(400);
      expect(resposta.body.erro.codigo).toBe('VALIDACAO_INVALIDA');
    });
  });

  describe('Cenário: produto novo depois do PUT aparece no fim da categoria', () => {
    it('Então "Abacaxi" vem depois dos posicionados', async () => {
      await salvar({ categorias: [{ id: bebidas, produtos: [suco, agua] }] }).expect(200);
      await criarProduto(app, lojista.token, filial, bebidas, { nome: 'Abacaxi' });
      const bebidasJson = (await obter()).categorias.find((c) => c.id === bebidas)!;
      expect(bebidasJson.produtos.map((p) => p.nome)).toEqual(['Suco', 'Água', 'Abacaxi', 'Cerveja']);
    });
  });

  describe('Cenário: produto movido de categoria (PATCH) perde a posição', () => {
    it('Então a coluna posicao fica null', async () => {
      await salvar({ categorias: [{ id: bebidas, produtos: [agua] }] }).expect(200);
      await app
        .http()
        .patch(`/v1/painel/filiais/${filial}/produtos/${agua}`)
        .set(auth())
        .send({ categoriaId: acougue })
        .expect(200);
      const [linha] = await banco.sequelize.query<{ posicao: number | null }>(
        'SELECT posicao FROM produtos WHERE id = :id',
        { replacements: { id: agua }, type: 'SELECT' as never },
      );
      expect(linha!.posicao).toBeNull();
    });
  });

  describe('Cenário: dois PUT simultâneos', () => {
    it('Então terminam sem erro e o resultado é um dos dois corpos inteiro', async () => {
      const um = {
        categorias: [
          { id: bebidas, produtos: [suco] },
          { id: acougue, produtos: [picanha] },
        ],
      };
      const outro = {
        categorias: [
          { id: acougue, produtos: [picanha] },
          { id: bebidas, produtos: [suco] },
        ],
      };
      const respostas = await Promise.all([salvar(um), salvar(outro)]);
      expect(respostas.map((r) => r.status)).toEqual([200, 200]);
      const ordem = (await obter()).categorias.map((c) => c.id);
      expect([
        [bebidas, acougue],
        [acougue, bebidas],
      ]).toContainEqual(ordem);
    });
  });

  describe('Cenário: lojista desativado', () => {
    it('Então GET 200 e PUT 403 LOJISTA_DESATIVADO', async () => {
      await definirStatus(banco.sequelize, lojista.id, StatusLojista.DESATIVADO);
      try {
        await app.http().get(url()).set(auth()).expect(200);
        const resposta = await salvar({ categorias: [] }).expect(403);
        expect(resposta.body.erro.codigo).toBe('LOJISTA_DESATIVADO');
      } finally {
        await definirStatus(banco.sequelize, lojista.id, StatusLojista.ATIVO);
      }
    });
  });
});
