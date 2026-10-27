import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes, type Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { EVENTO_CONTEUDO_ALTERADO } from '../../../common/eventos/conteudo-alterado.event';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { ordenarPorPosicao } from '../../../common/utils/ordem';
import { Categoria } from '../../categorias/models/categoria.model';
import { FiliaisService } from '../../filiais/services/filiais.service';
import { MidiaService } from '../../midia/services/midia.service';
import { Produto } from '../../produtos/models/produto.model';
import { filtroSituacao } from '../../vigencia/consultas/filtro-situacao';
import { VigenciaService } from '../../vigencia/services/vigencia.service';
import { validarEstrutura } from '../domain/validar-estrutura';
import type { SalvarEstruturaDto } from '../dtos/salvar-estrutura.dto';
import { estruturaView, type EstruturaView, type ProdutoDaEstruturaRow } from '../views/estrutura.view';

type Tabela = 'categorias' | 'produtos';

const ATRIBUTOS_PRODUTO = [
  'id',
  'categoriaId',
  'nome',
  'quantidade',
  'descricao',
  'observacao',
  'precoPromocionalCentavos',
  'precoOriginalCentavos',
  'fotoPath',
  'dataInicio',
  'dataLimite',
  'posicao',
];

/**
 * RN45: ordem das categorias e dos produtos da página de cada filial. Reordenar não é preço nem
 * data: sem auditoria, sem limite e sem tocar em updated_at (T5).
 */
@Injectable()
export class EstruturaService {
  constructor(
    @InjectModel(Categoria) private readonly categoriaModel: typeof Categoria,
    @InjectModel(Produto) private readonly produtoModel: typeof Produto,
    private readonly sequelize: Sequelize,
    private readonly filiais: FiliaisService,
    private readonly vigencia: VigenciaService,
    private readonly midia: MidiaService,
    private readonly eventos: EventEmitter2,
  ) {}

  /** Todas as categorias (o editor posiciona qualquer uma) e só produtos vigentes e agendados. */
  async obter(tenantId: string, filialId: string, transaction?: Transaction): Promise<EstruturaView> {
    const filial = await this.filiais.obter(tenantId, filialId, { transaction });
    const hoje = this.vigencia.hojeDaFilial(filial);
    const filtro = filtroSituacao(['VIGENTE', 'AGENDADO'], hoje);
    const [categorias, produtos] = await Promise.all([
      this.categoriaModel.findAll({
        where: { tenantId, filialId },
        attributes: ['id', 'nome', 'posicao'],
        raw: true,
        transaction,
      }),
      this.produtoModel.findAll({
        where: { tenantId, filialId, ...filtro.where },
        paranoid: filtro.paranoid,
        attributes: ATRIBUTOS_PRODUTO,
        raw: true,
        transaction,
      }),
    ]);

    const porCategoria = new Map<string, Array<ProdutoDaEstruturaRow & { posicao: number | null }>>();
    for (const produto of produtos) {
      const grupo = porCategoria.get(produto.categoriaId);
      if (grupo) grupo.push(produto);
      else porCategoria.set(produto.categoriaId, [produto]);
    }
    for (const [categoriaId, grupo] of porCategoria) porCategoria.set(categoriaId, ordenarPorPosicao(grupo));

    return estruturaView(ordenarPorPosicao(categorias), porCategoria, hoje, (caminho) =>
      this.midia.urlPublica(caminho),
    );
  }

  /** Substitui a ordem da filial. O lock na filial serializa dois PUT simultâneos (a última gravação vence). */
  async salvar(tenantId: string, filialId: string, dto: SalvarEstruturaDto): Promise<EstruturaView> {
    return this.sequelize.transaction(async (transaction) => {
      await this.filiais.obter(tenantId, filialId, { transaction, lock: transaction.LOCK.UPDATE });

      const [categorias, produtos] = await Promise.all([
        this.categoriaModel.findAll({
          where: { tenantId, filialId },
          attributes: ['id'],
          raw: true,
          transaction,
        }),
        this.produtoModel.findAll({
          where: { tenantId, filialId },
          attributes: ['id', 'categoriaId'],
          raw: true,
          transaction,
        }),
      ]);
      const resultado = validarEstrutura(dto.categorias, {
        categorias: new Set(categorias.map((c) => c.id)),
        categoriaDoProduto: new Map(produtos.map((p) => [p.id, p.categoriaId])),
      });
      if (!resultado.ok) {
        throw new AppError(CodigoErro.ESTRUTURA_INVALIDA, undefined, { problemas: resultado.problemas });
      }

      await this.limpar('categorias', tenantId, filialId, transaction);
      await this.limpar('produtos', tenantId, filialId, transaction);
      await this.gravar('categorias', resultado.valor.categorias, tenantId, filialId, transaction);
      await this.gravar('produtos', resultado.valor.produtos, tenantId, filialId, transaction);

      transaction.afterCommit(() => {
        this.eventos.emit(EVENTO_CONTEUDO_ALTERADO, { tenantId, filialId });
      });
      return this.obter(tenantId, filialId, transaction);
    });
  }

  /** O hook de tenant não cobre sequelize.query: tenant_id e filial_id ficam explícitos. */
  private async limpar(tabela: Tabela, tenantId: string, filialId: string, transaction: Transaction) {
    await this.sequelize.query(
      `UPDATE ${tabela} SET posicao = NULL
       WHERE tenant_id = :tenantId AND filial_id = :filialId AND deleted_at IS NULL AND posicao IS NOT NULL`,
      { replacements: { tenantId, filialId }, type: QueryTypes.UPDATE, transaction },
    );
  }

  /** Um UPDATE em lote; os ids vão por replacements nomeados, nunca concatenados. */
  private async gravar(
    tabela: Tabela,
    posicoes: ReadonlyArray<{ id: string; posicao: number }>,
    tenantId: string,
    filialId: string,
    transaction: Transaction,
  ) {
    if (posicoes.length === 0) return;
    const replacements: Record<string, string | number> = { tenantId, filialId };
    const valores = posicoes.map(({ id, posicao }, i) => {
      replacements[`id${i}`] = id;
      replacements[`posicao${i}`] = posicao;
      return `(CAST(:id${i} AS uuid), CAST(:posicao${i} AS integer))`;
    });
    await this.sequelize.query(
      `UPDATE ${tabela} AS t SET posicao = v.posicao
       FROM (VALUES ${valores.join(', ')}) AS v(id, posicao)
       WHERE t.id = v.id AND t.tenant_id = :tenantId AND t.filial_id = :filialId AND t.deleted_at IS NULL`,
      { replacements, type: QueryTypes.UPDATE, transaction },
    );
  }
}
