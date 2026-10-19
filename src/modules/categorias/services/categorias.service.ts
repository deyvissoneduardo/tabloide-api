import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes, type Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';
import { EVENTO_CONTEUDO_ALTERADO } from '../../../common/eventos/conteudo-alterado.event';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { naoEncontrado } from '../../../common/errors/errors';
import type { DataISO } from '../../../common/utils/date-only';
import { FiliaisService, type OpcoesObterFilial } from '../../filiais/services/filiais.service';
import { Produto } from '../../produtos/models/produto.model';
import { VigenciaService } from '../../vigencia/services/vigencia.service';
import type { CriarCategoriaDto } from '../dtos/criar-categoria.dto';
import type { RenomearCategoriaDto } from '../dtos/renomear-categoria.dto';
import { Categoria } from '../models/categoria.model';
import { categoriaView, type CategoriaComContagem, type CategoriaView } from '../views/categoria.view';

/**
 * Contagem por situação em uma consulta só (sem N+1). As condições repetem calcularSituacao
 * e vigencia/consultas/filtro-situacao.ts. O hook de tenant não cobre sequelize.query:
 * o tenant_id está explícito em categorias e em produtos.
 */
const SQL_CATEGORIAS_COM_CONTAGEM = `
  SELECT c.id, c.nome, c.created_at AS "createdAt", c.updated_at AS "updatedAt",
         COUNT(p.id) FILTER (WHERE p.data_inicio <= :hoje AND (p.data_limite IS NULL OR p.data_limite >= :hoje)) AS vigentes,
         COUNT(p.id) FILTER (WHERE p.data_inicio > :hoje) AS agendados,
         COUNT(p.id) FILTER (WHERE p.data_limite < :hoje) AS vencidos
  FROM categorias c
  LEFT JOIN produtos p
    ON p.categoria_id = c.id AND p.deleted_at IS NULL AND p.tenant_id = :tenantId
  WHERE c.tenant_id = :tenantId AND c.filial_id = :filialId AND c.deleted_at IS NULL
    AND (CAST(:categoriaId AS uuid) IS NULL OR c.id = CAST(:categoriaId AS uuid))
  GROUP BY c.id
  ORDER BY c.nome_normalizado, c.id`;

@Injectable()
export class CategoriasService {
  constructor(
    @InjectModel(Categoria) private readonly categoriaModel: typeof Categoria,
    @InjectModel(Produto) private readonly produtoModel: typeof Produto,
    private readonly sequelize: Sequelize,
    private readonly filiais: FiliaisService,
    private readonly vigencia: VigenciaService,
    private readonly eventos: EventEmitter2,
  ) {}

  async listar(tenantId: string, filialId: string): Promise<CategoriaView[]> {
    const filial = await this.filiais.obter(tenantId, filialId);
    const linhas = await this.comContagem(tenantId, filialId, this.vigencia.hojeDaFilial(filial));
    return linhas.map(categoriaView);
  }

  /** Nome repetido na filial: o índice único vira CATEGORIA_JA_EXISTE no filtro (sem consulta prévia, sem corrida). */
  async criar(tenantId: string, filialId: string, dto: CriarCategoriaDto): Promise<CategoriaView> {
    await this.filiais.obter(tenantId, filialId);
    const categoria = await this.categoriaModel.create({ id: uuidv7(), tenantId, filialId, nome: dto.nome });
    return categoriaView({ ...categoria.get(), vigentes: 0, agendados: 0, vencidos: 0 });
  }

  async renomear(
    tenantId: string,
    filialId: string,
    categoriaId: string,
    dto: RenomearCategoriaDto,
  ): Promise<CategoriaView> {
    const filial = await this.filiais.obter(tenantId, filialId);
    await this.sequelize.transaction(async (transaction) => {
      const categoria = await this.obterDaFilial(tenantId, filialId, categoriaId, { transaction });
      if (categoria.nome === dto.nome) return;
      await categoria.update({ nome: dto.nome }, { transaction });
      this.emitirAposCommit(transaction, tenantId, filialId);
    });
    const [linha] = await this.comContagem(
      tenantId,
      filialId,
      this.vigencia.hojeDaFilial(filial),
      categoriaId,
    );
    if (!linha) throw naoEncontrado();
    return categoriaView(linha);
  }

  /**
   * RN20: vigentes ou agendados bloqueiam; os vencidos são excluídos logicamente junto.
   * O FOR UPDATE na categoria conflita com o FOR SHARE do cadastro de produto (D4.6).
   */
  async excluir(tenantId: string, filialId: string, categoriaId: string): Promise<void> {
    await this.sequelize.transaction(async (transaction) => {
      const filial = await this.filiais.obter(tenantId, filialId, { transaction });
      const categoria = await this.obterDaFilial(tenantId, filialId, categoriaId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const hoje = this.vigencia.hojeDaFilial(filial);
      const [contagem] = await this.comContagem(tenantId, filialId, hoje, categoriaId, transaction);
      const vigentes = Number(contagem?.vigentes ?? 0);
      const agendados = Number(contagem?.agendados ?? 0);
      if (vigentes + agendados > 0) {
        throw new AppError(CodigoErro.CATEGORIA_COM_PRODUTOS_ATIVOS, undefined, { vigentes, agendados });
      }

      // pela checagem acima, só restam vencidos
      await this.produtoModel.destroy({ where: { tenantId, categoriaId, filialId }, transaction });
      await categoria.destroy({ transaction });
      this.emitirAposCommit(transaction, tenantId, filialId);
    });
  }

  /** Categoria não excluída da filial e do tenant; qualquer outra coisa é 404. */
  async obterDaFilial(
    tenantId: string,
    filialId: string,
    categoriaId: string,
    opts: OpcoesObterFilial = {},
  ): Promise<Categoria> {
    const categoria = await this.categoriaModel.findOne({
      where: { id: categoriaId, tenantId, filialId },
      ...opts,
    });
    if (!categoria) throw naoEncontrado();
    return categoria;
  }

  private comContagem(
    tenantId: string,
    filialId: string,
    hoje: DataISO,
    categoriaId: string | null = null,
    transaction?: Transaction,
  ): Promise<CategoriaComContagem[]> {
    return this.sequelize.query<CategoriaComContagem>(SQL_CATEGORIAS_COM_CONTAGEM, {
      replacements: { tenantId, filialId, hoje, categoriaId },
      type: QueryTypes.SELECT,
      transaction,
    });
  }

  private emitirAposCommit(transaction: Transaction, tenantId: string, filialId: string): void {
    transaction.afterCommit(() => {
      this.eventos.emit(EVENTO_CONTEUDO_ALTERADO, { tenantId, filialId });
    });
  }
}
