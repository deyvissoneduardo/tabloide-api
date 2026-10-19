import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/sequelize';
import { Op, type Transaction, type WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';
import type { Pagina } from '../../../common/dtos/paginacao-query.dto';
import { EVENTO_CONTEUDO_ALTERADO } from '../../../common/eventos/conteudo-alterado.event';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { naoEncontrado } from '../../../common/errors/errors';
import { mensagemDeErro } from '../../../common/errors/mensagem-de-erro';
import { VERIFICADOR_LIMITES, type VerificadorLimites } from '../../../common/limites/verificador-limites';
import type { DataISO } from '../../../common/utils/date-only';
import { escaparLike, normalizarParaBusca } from '../../../common/utils/text';
import { AuditoriaService, CAMPOS_AUDITADOS } from '../../auditoria/services/auditoria.service';
import { Categoria } from '../../categorias/models/categoria.model';
import { CategoriasService } from '../../categorias/services/categorias.service';
import { FiliaisService } from '../../filiais/services/filiais.service';
import { MidiaService } from '../../midia/services/midia.service';
import { filtroSituacao } from '../../vigencia/consultas/filtro-situacao';
import { validarCriacao } from '../../vigencia/domain/datas';
import { validarEdicaoDeDatas } from '../../vigencia/domain/edicao';
import { calcularSituacao } from '../../vigencia/domain/situacao';
import { valorOuErro } from '../../vigencia/domain/valor-ou-erro';
import { VigenciaService } from '../../vigencia/services/vigencia.service';
import { validarPrecos } from '../domain/validar-precos';
import type { CriarProdutoDto } from '../dtos/criar-produto.dto';
import type { EditarProdutoDto } from '../dtos/editar-produto.dto';
import type { ListarProdutosQueryDto } from '../dtos/listar-produtos-query.dto';
import { Produto, type AtributosProduto } from '../models/produto.model';
import { produtoView, type ProdutoView } from '../views/produto.view';

const CAMPOS_EDITAVEIS = [
  'nome',
  'categoriaId',
  'quantidade',
  'precoPromocionalCentavos',
  'precoOriginalCentavos',
  'descricao',
  'observacao',
  'dataInicio',
  'dataLimite',
] as const;

type CampoEditavel = (typeof CAMPOS_EDITAVEIS)[number];
type ValoresEditaveis = Pick<AtributosProduto, CampoEditavel>;

/** Objeto novo a cada consulta: o Sequelize altera as opções de include. */
const incluirCategoria = () => ({ model: Categoria, attributes: ['id', 'nome'], paranoid: false });

@Injectable()
export class ProdutosService {
  private readonly logger = new Logger(ProdutosService.name);

  constructor(
    @InjectModel(Produto) private readonly produtoModel: typeof Produto,
    @InjectModel(Categoria) private readonly categoriaModel: typeof Categoria,
    private readonly sequelize: Sequelize,
    private readonly filiais: FiliaisService,
    private readonly categorias: CategoriasService,
    private readonly vigencia: VigenciaService,
    private readonly midia: MidiaService,
    private readonly auditoria: AuditoriaService,
    @Inject(VERIFICADOR_LIMITES) private readonly limites: VerificadorLimites,
    private readonly eventos: EventEmitter2,
  ) {}

  /** Ordem alfabética pt-BR estável (D4.2); busca sem acento com os curingas escapados. */
  async listar(
    tenantId: string,
    filialId: string,
    query: ListarProdutosQueryDto,
  ): Promise<Pagina<ProdutoView>> {
    const filial = await this.filiais.obter(tenantId, filialId);
    const hoje = this.vigencia.hojeDaFilial(filial);
    const filtro = filtroSituacao(query.situacao, hoje);
    const where: WhereOptions<AtributosProduto> = { tenantId, filialId, ...filtro.where };
    if (query.categoriaId) Object.assign(where, { categoriaId: query.categoriaId });
    if (query.busca) {
      Object.assign(where, {
        nomeNormalizado: { [Op.like]: `%${escaparLike(normalizarParaBusca(query.busca))}%` },
      });
    }
    const { rows, count } = await this.produtoModel.findAndCountAll({
      where,
      paranoid: filtro.paranoid,
      // o produto excluído em cascata mostra a categoria também excluída
      include: [incluirCategoria()],
      order: [
        ['nomeNormalizado', 'ASC'],
        ['id', 'ASC'],
      ],
      limit: query.porPagina,
      offset: (query.pagina - 1) * query.porPagina,
    });
    return {
      itens: rows.map((p) => this.view(p, p.categoria!, hoje)),
      total: count,
      pagina: query.pagina,
      porPagina: query.porPagina,
    };
  }

  /** Inclui excluídos, para consulta (RN25). Produto de outra filial ou tenant: 404. */
  async obter(tenantId: string, filialId: string, id: string): Promise<ProdutoView> {
    const filial = await this.filiais.obter(tenantId, filialId);
    const produto = await this.produtoModel.findOne({
      where: { id, tenantId, filialId },
      paranoid: false,
      include: [incluirCategoria()],
    });
    if (!produto) throw naoEncontrado();
    return this.view(produto, produto.categoria!, this.vigencia.hojeDaFilial(filial));
  }

  /**
   * RN19, RN21, RN40, RN42. As validações puras vêm antes de qualquer I/O; a foto é processada
   * e salva fora da transação (não prende conexão do pool) e, se o banco falhar depois, fica
   * órfã no storage, só registrada em log (D3.4).
   */
  async criar(tenantId: string, filialId: string, dto: CriarProdutoDto, foto?: Buffer): Promise<ProdutoView> {
    const filial = await this.filiais.obter(tenantId, filialId);
    const hoje = this.vigencia.hojeDaFilial(filial);
    const precoOriginalCentavos = dto.precoOriginalCentavos ?? null;
    validarPrecos(dto.precoPromocionalCentavos, precoOriginalCentavos);
    const periodo = valorOuErro(
      validarCriacao({ dataInicio: dto.dataInicio, dataLimite: dto.dataLimite ?? null }, hoje),
    );

    let fotoPath: string | null = null;
    if (foto) {
      const imagem = await this.midia.processar(tenantId, foto, 'produto');
      fotoPath = await this.midia.salvar(tenantId, 'produto', imagem);
    }

    try {
      return await this.sequelize.transaction(async (transaction) => {
        // FOR SHARE: a exclusão da categoria (FOR UPDATE) espera este cadastro, e vice-versa (D4.6)
        const categoria = await this.categorias.obterDaFilial(tenantId, filialId, dto.categoriaId, {
          transaction,
          lock: transaction.LOCK.SHARE,
        });
        await this.limites.verificarCriacaoProduto(tenantId, filialId, { transaction });

        const valores = {
          precoPromocionalCentavos: dto.precoPromocionalCentavos,
          precoOriginalCentavos,
          dataInicio: periodo.inicio,
          dataLimite: periodo.limite,
        };
        const produto = await this.produtoModel.create(
          {
            id: uuidv7(),
            tenantId,
            filialId,
            categoriaId: categoria.id,
            nome: dto.nome,
            quantidade: dto.quantidade ?? null,
            descricao: dto.descricao ?? null,
            observacao: dto.observacao ?? null,
            fotoPath,
            ...valores,
          },
          { transaction },
        );
        await this.auditoria.registrarCriacao(
          tenantId,
          'PRODUTO',
          produto.id,
          valores,
          CAMPOS_AUDITADOS.PRODUTO,
          { transaction },
        );
        this.emitirAposCommit(transaction, tenantId, filialId);
        return this.view(produto, categoria, hoje);
      });
    } catch (err) {
      this.registrarOrfao(fotoPath, tenantId, err);
      throw err;
    }
  }

  /**
   * RN26: só vigente ou agendado; o início de um vigente não muda. RN21 vale sobre os valores
   * resultantes. Preço e datas alterados são auditados (RNF07). Sem mudança real: no-op.
   */
  async editar(tenantId: string, filialId: string, id: string, dto: EditarProdutoDto): Promise<ProdutoView> {
    const filial = await this.filiais.obter(tenantId, filialId);
    const hoje = this.vigencia.hojeDaFilial(filial);
    return this.sequelize.transaction(async (transaction) => {
      const produto = await this.obterEditavel(tenantId, filialId, id, hoje, transaction);
      const antes = valoresEditaveis(produto);
      const depois: ValoresEditaveis = { ...antes };
      for (const campo of CAMPOS_EDITAVEIS) {
        if (dto[campo] !== undefined) Object.assign(depois, { [campo]: dto[campo] });
      }

      if (dto.dataInicio !== undefined || dto.dataLimite !== undefined) {
        const periodo = valorOuErro(
          validarEdicaoDeDatas(
            { dataInicio: produto.dataInicio, dataLimite: produto.dataLimite, deletedAt: null },
            { dataInicio: dto.dataInicio, dataLimite: dto.dataLimite },
            hoje,
          ),
        );
        depois.dataInicio = periodo.inicio;
        depois.dataLimite = periodo.limite;
      }
      validarPrecos(depois.precoPromocionalCentavos, depois.precoOriginalCentavos);

      let categoria: { id: string; nome: string } | null = null;
      if (depois.categoriaId !== antes.categoriaId) {
        categoria = await this.categorias.obterDaFilial(tenantId, filialId, depois.categoriaId, {
          transaction,
          lock: transaction.LOCK.SHARE,
        });
      }

      const mudancas = Object.fromEntries(
        CAMPOS_EDITAVEIS.filter((c) => depois[c] !== antes[c]).map((c) => [c, depois[c]]),
      ) as Partial<ValoresEditaveis>;
      if (Object.keys(mudancas).length === 0) return this.paraView(produto, hoje, transaction);

      await produto.update(mudancas, { transaction });
      await this.auditoria.registrarAlteracoes(
        tenantId,
        'PRODUTO',
        id,
        antes,
        mudancas,
        CAMPOS_AUDITADOS.PRODUTO,
        { transaction },
      );
      this.emitirAposCommit(transaction, tenantId, filialId);
      return categoria ? this.view(produto, categoria, hoje) : this.paraView(produto, hoje, transaction);
    });
  }

  /**
   * Exclusão lógica em qualquer situação ativa ou vencida (RN25): RN26 só proíbe editar ou
   * reativar. Já excluído: ITEM_NAO_EDITAVEL. Sem auditoria: o deleted_at é o registro.
   */
  async excluir(tenantId: string, filialId: string, id: string): Promise<void> {
    await this.sequelize.transaction(async (transaction) => {
      await this.filiais.obter(tenantId, filialId, { transaction });
      const produto = await this.produtoModel.findOne({
        where: { id, tenantId, filialId },
        paranoid: false,
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!produto) throw naoEncontrado();
      if (produto.deletedAt) throw new AppError(CodigoErro.ITEM_NAO_EDITAVEL);
      await produto.destroy({ transaction });
      this.emitirAposCommit(transaction, tenantId, filialId);
    });
  }

  /**
   * Produto da filial que ainda pode ser alterado (vigente ou agendado). Com transação, trava a
   * linha; sem ela, é a leitura prévia barata da troca de foto.
   */
  async obterEditavel(
    tenantId: string,
    filialId: string,
    id: string,
    hoje: DataISO,
    transaction?: Transaction,
  ): Promise<Produto> {
    const produto = await this.produtoModel.findOne({
      where: { id, tenantId, filialId },
      paranoid: false,
      ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!produto) throw naoEncontrado();
    const situacao = calcularSituacao(
      {
        dataInicio: produto.dataInicio,
        dataLimite: produto.dataLimite,
        deletedAt: produto.deletedAt ?? null,
      },
      hoje,
    );
    if (situacao !== 'AGENDADO' && situacao !== 'VIGENTE') {
      throw new AppError(
        CodigoErro.ITEM_NAO_EDITAVEL,
        'Produtos vencidos ou excluídos não podem ser editados. Cadastre um novo produto.',
      );
    }
    return produto;
  }

  /** View com o nome da categoria atual (que pode ter sido excluída, no caso de produto excluído). */
  async paraView(produto: Produto, hoje: DataISO, transaction?: Transaction): Promise<ProdutoView> {
    const categoria = await this.categoriaModel.findOne({
      where: { id: produto.categoriaId, tenantId: produto.tenantId },
      attributes: ['id', 'nome'],
      paranoid: false,
      transaction,
    });
    if (!categoria) throw naoEncontrado();
    return this.view(produto, categoria, hoje);
  }

  private view(produto: Produto, categoria: { id: string; nome: string }, hoje: DataISO): ProdutoView {
    return produtoView(produto, categoria, hoje, this.midia.urlPublica(produto.fotoPath));
  }

  private emitirAposCommit(transaction: Transaction, tenantId: string, filialId: string): void {
    transaction.afterCommit(() => {
      this.eventos.emit(EVENTO_CONTEUDO_ALTERADO, { tenantId, filialId });
    });
  }

  /** D3.4: o arquivo enviado antes de uma falha de banco fica no storage; só registramos. */
  private registrarOrfao(caminho: string | null, tenantId: string, err: unknown): void {
    if (caminho === null) return;
    this.logger.warn({ evento: 'midia.arquivo_orfao', caminho, tenantId, erro: mensagemDeErro(err) });
  }
}

function valoresEditaveis(produto: Produto): ValoresEditaveis {
  return Object.fromEntries(
    CAMPOS_EDITAVEIS.map((c) => [c, produto[c] ?? null]),
  ) as unknown as ValoresEditaveis;
}
