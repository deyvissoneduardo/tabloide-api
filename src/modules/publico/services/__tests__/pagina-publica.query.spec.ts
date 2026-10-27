import { Op } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { DataISO } from '../../../../common/utils/date-only';
import { Categoria } from '../../../categorias/models/categoria.model';
import type { Panfleto } from '../../../panfletos/models/panfleto.model';
import type { Produto } from '../../../produtos/models/produto.model';
import { PaginaPublicaQuery } from '../pagina-publica.query';
import { umEndereco } from '../../../../../test/factories/endereco-filial.factory';

const HOJE = '2026-10-18' as DataISO;

describe('Funcionalidade: Consultas da página pública', () => {
  const sequelize = { query: jest.fn(), escape: (v: string) => `'${v}'` };
  const panfletoModel = { findOne: jest.fn() };
  const produtoModel = { findAll: jest.fn() };
  const consultas = new PaginaPublicaQuery(
    sequelize as unknown as Sequelize,
    panfletoModel as unknown as typeof Panfleto,
    produtoModel as unknown as typeof Produto,
  );

  beforeEach(() => jest.resetAllMocks());

  describe('Cenário: filial pelo código com lojista e status', () => {
    it('Então a linha é aninhada em lojista e o SQL ignora filiais excluídas', async () => {
      sequelize.query.mockResolvedValue([
        {
          id: 'f1',
          tenantId: 't1',
          nome: 'Centro',
          fusoHorario: 'America/Sao_Paulo',
          ...umEndereco(),
          nomeFantasia: 'M',
          logoPath: null,
          corPrimaria: '#C8102E',
          corSecundaria: null,
          sePanfleto: true,
          status: 'ATIVO',
        },
      ]);
      expect(await consultas.buscarFilialPorCodigo('k7Qm2xPa')).toEqual({
        id: 'f1',
        tenantId: 't1',
        nome: 'Centro',
        endereco: umEndereco(),
        fusoHorario: 'America/Sao_Paulo',
        lojista: {
          nomeFantasia: 'M',
          logoPath: null,
          corPrimaria: '#C8102E',
          corSecundaria: null,
          sePanfleto: true,
          status: 'ATIVO',
        },
      });
      const [sql, opcoes] = sequelize.query.mock.calls[0]!;
      expect(sql).toContain('f.deleted_at IS NULL');
      expect(sql).toContain('l.se_panfleto AS "sePanfleto"');
      expect(sql).toContain(
        'LEFT JOIN filial_enderecos e ON e.filial_id = f.id AND e.tenant_id = f.tenant_id',
      );
      expect(opcoes.replacements).toEqual({ codigo: 'k7Qm2xPa' });
    });

    it('E filial sem endereço (colunas do LEFT JOIN nulas) vem com endereco null', async () => {
      const semEndereco = Object.fromEntries(Object.keys(umEndereco()).map((k) => [k, null]));
      sequelize.query.mockResolvedValue([
        { id: 'f1', tenantId: 't1', nome: 'Centro', fusoHorario: 'America/Sao_Paulo', ...semEndereco },
      ]);
      expect(await consultas.buscarFilialPorCodigo('k7Qm2xPa')).toMatchObject({ endereco: null });
    });

    it('E código sem filial devolve null', async () => {
      sequelize.query.mockResolvedValue([]);
      expect(await consultas.buscarFilialPorCodigo('zzzzzzzz')).toBeNull();
    });
  });

  describe('Cenário: panfleto vigente pelo daterange do EXCLUDE', () => {
    it('Então filtra tenant, filial e o dia, só com as colunas da view', async () => {
      panfletoModel.findOne.mockResolvedValue(null);
      await consultas.buscarPanfletoVigente('t1', 'f1', HOJE);
      const [opcoes] = panfletoModel.findOne.mock.calls[0]!;
      expect(opcoes.where).toMatchObject({ tenantId: 't1', filialId: 'f1' });
      expect(opcoes.where[Op.and][0].val).toBe(
        `daterange(data_inicio, data_limite, '[]') @> '2026-10-18'::date`,
      );
      expect(opcoes).toMatchObject({
        attributes: ['tipoArquivo', 'imagemPath', 'imagemLargura', 'imagemAltura', 'dataLimite'],
        raw: true,
      });
    });
  });

  describe('Cenário: produtos vigentes de categorias não excluídas', () => {
    it('Então where de vigência, inner join com a categoria do mesmo tenant e sem ordenação', async () => {
      produtoModel.findAll.mockResolvedValue([]);
      await consultas.buscarProdutosVigentes('t1', 'f1', HOJE);
      const [opcoes] = produtoModel.findAll.mock.calls[0]!;
      expect(opcoes.where).toMatchObject({ tenantId: 't1', filialId: 'f1', dataInicio: { [Op.lte]: HOJE } });
      expect(opcoes.where[Op.or]).toEqual([{ dataLimite: null }, { dataLimite: { [Op.gte]: HOJE } }]);
      expect(opcoes.include).toEqual([
        {
          model: Categoria,
          attributes: ['id', 'nome', 'posicao'],
          required: true,
          where: { tenantId: 't1' },
        },
      ]);
      // RN45: a posição do produto e a da categoria vêm para a ordenação em memória
      expect(opcoes.attributes).toContain('posicao');
      expect(opcoes).toMatchObject({ raw: true, nest: true });
      expect(opcoes.order).toBeUndefined();
    });
  });
});
