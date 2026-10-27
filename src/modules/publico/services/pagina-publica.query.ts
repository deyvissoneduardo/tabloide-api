import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { literal, Op, QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type { DataISO } from '../../../common/utils/date-only';
import { Categoria } from '../../categorias/models/categoria.model';
import type { EnderecoFilial } from '../../filiais/domain/endereco';
import type { StatusLojista } from '../../lojistas/models/status-lojista';
import { Panfleto } from '../../panfletos/models/panfleto.model';
import { Produto } from '../../produtos/models/produto.model';
import type { FilialPublicaRow, PanfletoRow, ProdutoRow } from '../domain/montar-pagina';

/**
 * Única consulta do sistema sem tenant conhecido: é ela que descobre o tenant pelo código.
 * O status volta para o service decidir, para "não existe", "excluída" e "inativo" custarem o
 * mesmo e a regra (RN35) ser testável em unidade.
 */
const SQL_FILIAL_POR_CODIGO = `
  SELECT f.id, f.tenant_id AS "tenantId", f.nome, f.fuso_horario AS "fusoHorario",
         e.cep, e.logradouro, e.numero, e.complemento, e.bairro, e.cidade, e.uf,
         l.nome_fantasia AS "nomeFantasia", l.logo_path AS "logoPath",
         l.cor_primaria AS "corPrimaria", l.cor_secundaria AS "corSecundaria",
         l.se_panfleto AS "sePanfleto", a.status
  FROM filiais f
  JOIN lojistas l          ON l.id = f.tenant_id
  JOIN lojista_ativacoes a ON a.lojista_id = l.id
  LEFT JOIN filial_enderecos e ON e.filial_id = f.id AND e.tenant_id = f.tenant_id
  WHERE f.codigo_publico = :codigo AND f.deleted_at IS NULL
  LIMIT 1`;

/** Colunas do endereço vêm todas null quando a filial não tem endereço (LEFT JOIN). */
type ColunasEndereco = { [K in keyof EnderecoFilial]: EnderecoFilial[K] | null };

interface LinhaFilial extends ColunasEndereco {
  id: string;
  tenantId: string;
  nome: string;
  fusoHorario: string;
  nomeFantasia: string;
  logoPath: string | null;
  corPrimaria: string | null;
  corSecundaria: string | null;
  sePanfleto: boolean;
  status: StatusLojista;
}

@Injectable()
export class PaginaPublicaQuery {
  constructor(
    private readonly sequelize: Sequelize,
    @InjectModel(Panfleto) private readonly panfletoModel: typeof Panfleto,
    @InjectModel(Produto) private readonly produtoModel: typeof Produto,
  ) {}

  /** Consulta 1: índice único de codigo_publico + PKs de lojistas e lojista_ativacoes. */
  async buscarFilialPorCodigo(codigo: string): Promise<FilialPublicaRow | null> {
    const [linha] = await this.sequelize.query<LinhaFilial>(SQL_FILIAL_POR_CODIGO, {
      replacements: { codigo },
      type: QueryTypes.SELECT,
    });
    if (!linha) return null;
    const { nomeFantasia, logoPath, corPrimaria, corSecundaria, sePanfleto, status, ...resto } = linha;
    const { cep, logradouro, numero, complemento, bairro, cidade, uf, ...filial } = resto;
    // as colunas são NOT NULL: só vêm null juntas, quando a filial não tem endereço
    const endereco =
      cep === null ? null : ({ cep, logradouro, numero, complemento, bairro, cidade, uf } as EnderecoFilial);
    return {
      ...filial,
      endereco,
      lojista: { nomeFantasia, logoPath, corPrimaria, corSecundaria, sePanfleto, status },
    };
  }

  /**
   * Consulta 2: a mesma expressão daterange do EXCLUDE da Fase 3, para o planner poder usar o
   * índice GiST parcial. data_limite NULL vira limite infinito. O EXCLUDE garante no máximo 1.
   */
  async buscarPanfletoVigente(
    tenantId: string,
    filialId: string,
    hoje: DataISO,
  ): Promise<PanfletoRow | null> {
    const linha = await this.panfletoModel.findOne({
      where: {
        tenantId,
        filialId,
        [Op.and]: [
          literal(`daterange(data_inicio, data_limite, '[]') @> ${this.sequelize.escape(hoje)}::date`),
        ],
      },
      attributes: ['tipoArquivo', 'imagemPath', 'imagemLargura', 'imagemAltura', 'dataLimite'],
      raw: true,
    });
    return linha as PanfletoRow | null;
  }

  /**
   * Consulta 3: produtos vigentes (RN23) de categorias não excluídas, pelo índice
   * produtos_filial_ativos_idx. Sem ORDER BY: a ordem (posição e depois pt-BR, RN45) é feita em
   * memória, sem depender da collation do banco.
   */
  async buscarProdutosVigentes(tenantId: string, filialId: string, hoje: DataISO): Promise<ProdutoRow[]> {
    const linhas = await this.produtoModel.findAll({
      where: {
        tenantId,
        filialId,
        dataInicio: { [Op.lte]: hoje },
        [Op.or]: [{ dataLimite: null }, { dataLimite: { [Op.gte]: hoje } }],
      },
      attributes: [
        'id',
        'nome',
        'quantidade',
        'precoPromocionalCentavos',
        'precoOriginalCentavos',
        'descricao',
        'observacao',
        'fotoPath',
        'dataLimite',
        'posicao',
      ],
      // paranoid do include: c.deleted_at IS NULL; o tenant também é exigido na categoria
      include: [
        { model: Categoria, attributes: ['id', 'nome', 'posicao'], required: true, where: { tenantId } },
      ],
      raw: true,
      nest: true,
    });
    return linhas as unknown as ProdutoRow[];
  }
}
