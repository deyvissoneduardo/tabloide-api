import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/sequelize';
import type { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';
import type { Pagina } from '../../../common/dtos/paginacao-query.dto';
import { EVENTO_CONTEUDO_ALTERADO } from '../../../common/eventos/conteudo-alterado.event';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { naoEncontrado } from '../../../common/errors/errors';
import { mensagemDeErro } from '../../../common/errors/mensagem-de-erro';
import type { DataISO } from '../../../common/utils/date-only';
import { AuditoriaService, CAMPOS_AUDITADOS } from '../../auditoria/services/auditoria.service';
import type { Filial } from '../../filiais/models/filial.model';
import { FiliaisService } from '../../filiais/services/filiais.service';
import { MidiaService } from '../../midia/services/midia.service';
import { filtroSituacao } from '../../vigencia/consultas/filtro-situacao';
import { validarCriacao } from '../../vigencia/domain/datas';
import { validarEdicaoDeDatas } from '../../vigencia/domain/edicao';
import { calcularSituacao } from '../../vigencia/domain/situacao';
import type { ResultadoValidacao } from '../../vigencia/domain/vigencia.types';
import { VigenciaService } from '../../vigencia/services/vigencia.service';
import { encontrarConflito, type PeriodoPanfleto } from '../domain/conflito-periodo';
import type { CriarPanfletoDto } from '../dtos/criar-panfleto.dto';
import type { EditarDatasPanfletoDto } from '../dtos/editar-datas-panfleto.dto';
import type { ListarPanfletosQueryDto } from '../dtos/listar-panfletos-query.dto';
import { Panfleto } from '../models/panfleto.model';
import { panfletoView, type PanfletoView } from '../views/panfleto.view';

const ATRIBUTOS_PERIODO = ['id', 'dataInicio', 'dataLimite'];

/** Converte o resultado das regras puras de vigência em erro HTTP. */
function valorOuErro<T>(resultado: ResultadoValidacao<T>): T {
  if (!resultado.ok) throw new AppError(CodigoErro[resultado.codigo], undefined, { campo: resultado.campo });
  return resultado.valor;
}

@Injectable()
export class PanfletosService {
  private readonly logger = new Logger(PanfletosService.name);

  constructor(
    @InjectModel(Panfleto) private readonly panfletoModel: typeof Panfleto,
    private readonly sequelize: Sequelize,
    private readonly filiais: FiliaisService,
    private readonly vigencia: VigenciaService,
    private readonly midia: MidiaService,
    private readonly auditoria: AuditoriaService,
    private readonly eventos: EventEmitter2,
  ) {}

  /**
   * Ordem (D3.3): processa a imagem fora da transação; dentro dela trava a filial, valida
   * as regras e só então envia ao storage, para um conflito de período não deixar arquivo órfão.
   */
  async criar(
    tenantId: string,
    filialId: string,
    dto: CriarPanfletoDto,
    arquivo: Buffer,
  ): Promise<PanfletoView> {
    const imagem = await this.midia.processar(tenantId, arquivo, 'panfleto');
    let caminhoSalvo: string | null = null;
    try {
      return await this.sequelize.transaction(async (transaction) => {
        const filial = await this.travarFilial(tenantId, filialId, transaction);
        const hoje = this.vigencia.hojeDaFilial(filial);
        const periodo = valorOuErro(
          validarCriacao({ dataInicio: dto.dataInicio, dataLimite: dto.dataLimite ?? null }, hoje),
        );
        const novo = { dataInicio: periodo.inicio, dataLimite: periodo.limite };
        await this.garantirSemConflito(tenantId, filialId, novo, transaction);

        caminhoSalvo = await this.midia.salvar(tenantId, 'panfleto', imagem);
        const criado = await this.panfletoModel.create(
          {
            id: uuidv7(),
            tenantId,
            filialId,
            imagemPath: caminhoSalvo,
            imagemLargura: imagem.largura,
            imagemAltura: imagem.altura,
            ...novo,
          },
          { transaction },
        );
        await this.auditoria.registrarCriacao(
          tenantId,
          'PANFLETO',
          criado.id,
          { ...novo, imagemPath: caminhoSalvo },
          CAMPOS_AUDITADOS.PANFLETO,
          { transaction },
        );
        this.emitirAposCommit(transaction, tenantId, filialId);
        return this.view(criado, hoje);
      });
    } catch (err) {
      this.registrarOrfao(caminhoSalvo, tenantId, err);
      throw err;
    }
  }

  async listar(
    tenantId: string,
    filialId: string,
    query: ListarPanfletosQueryDto,
  ): Promise<Pagina<PanfletoView>> {
    const filial = await this.filiais.obter(tenantId, filialId);
    const hoje = this.vigencia.hojeDaFilial(filial);
    const filtro = filtroSituacao(query.situacao, hoje);
    const { rows, count } = await this.panfletoModel.findAndCountAll({
      where: { tenantId, filialId, ...filtro.where },
      paranoid: filtro.paranoid,
      order: [
        ['dataInicio', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: query.porPagina,
      offset: (query.pagina - 1) * query.porPagina,
    });
    return {
      itens: rows.map((p) => this.view(p, hoje)),
      total: count,
      pagina: query.pagina,
      porPagina: query.porPagina,
    };
  }

  /** Inclui excluídos, para consulta (RN25). Panfleto de outra filial ou tenant: 404. */
  async detalhar(tenantId: string, filialId: string, id: string): Promise<PanfletoView> {
    const filial = await this.filiais.obter(tenantId, filialId);
    const panfleto = await this.panfletoModel.findOne({ where: { id, tenantId, filialId }, paranoid: false });
    if (!panfleto) throw naoEncontrado();
    return this.view(panfleto, this.vigencia.hojeDaFilial(filial));
  }

  /** RN26: vigente ou agendado; o início de um vigente não muda; mudanças de data são auditadas. */
  async editarDatas(
    tenantId: string,
    filialId: string,
    id: string,
    dto: EditarDatasPanfletoDto,
  ): Promise<PanfletoView> {
    return this.sequelize.transaction(async (transaction) => {
      const filial = await this.travarFilial(tenantId, filialId, transaction);
      const panfleto = await this.travarPanfleto(tenantId, filialId, id, transaction);
      const hoje = this.vigencia.hojeDaFilial(filial);
      const periodo = valorOuErro(
        validarEdicaoDeDatas(
          { dataInicio: panfleto.dataInicio, dataLimite: panfleto.dataLimite, deletedAt: null },
          { dataInicio: dto.dataInicio, dataLimite: dto.dataLimite },
          hoje,
        ),
      );
      const antes = { dataInicio: panfleto.dataInicio, dataLimite: panfleto.dataLimite };
      const depois = { dataInicio: periodo.inicio, dataLimite: periodo.limite };
      // sem mudança: nada gravado, nada auditado, nenhum evento
      if (antes.dataInicio === depois.dataInicio && antes.dataLimite === depois.dataLimite) {
        return this.view(panfleto, hoje);
      }

      await this.garantirSemConflito(tenantId, filialId, depois, transaction, id);
      await panfleto.update(depois, { transaction });
      await this.auditoria.registrarAlteracoes(
        tenantId,
        'PANFLETO',
        id,
        antes,
        depois,
        CAMPOS_AUDITADOS.PANFLETO,
        { transaction },
      );
      this.emitirAposCommit(transaction, tenantId, filialId);
      return this.view(panfleto, hoje);
    });
  }

  /** D3.2: a imagem tem os preços; a troca é auditada e o arquivo anterior fica no storage. */
  async trocarImagem(tenantId: string, filialId: string, id: string, arquivo: Buffer): Promise<PanfletoView> {
    const imagem = await this.midia.processar(tenantId, arquivo, 'panfleto');
    let caminhoSalvo: string | null = null;
    try {
      return await this.sequelize.transaction(async (transaction) => {
        const filial = await this.filiais.obter(tenantId, filialId, { transaction });
        const panfleto = await this.travarPanfleto(tenantId, filialId, id, transaction);
        const hoje = this.vigencia.hojeDaFilial(filial);
        const situacao = calcularSituacao({ ...panfleto.get(), deletedAt: null }, hoje);
        if (situacao !== 'AGENDADO' && situacao !== 'VIGENTE')
          throw new AppError(CodigoErro.ITEM_NAO_EDITAVEL);

        caminhoSalvo = await this.midia.salvar(tenantId, 'panfleto', imagem);
        const anterior = panfleto.imagemPath;
        await panfleto.update(
          { imagemPath: caminhoSalvo, imagemLargura: imagem.largura, imagemAltura: imagem.altura },
          { transaction },
        );
        await this.auditoria.registrarAlteracoes(
          tenantId,
          'PANFLETO',
          id,
          { imagemPath: anterior },
          { imagemPath: caminhoSalvo },
          CAMPOS_AUDITADOS.PANFLETO,
          { transaction },
        );
        this.emitirAposCommit(transaction, tenantId, filialId);
        return this.view(panfleto, hoje);
      });
    } catch (err) {
      this.registrarOrfao(caminhoSalvo, tenantId, err);
      throw err;
    }
  }

  /** Exclusão lógica em qualquer situação (RN25). Já excluído ou inexistente: 404. */
  async excluir(tenantId: string, filialId: string, id: string): Promise<void> {
    await this.sequelize.transaction(async (transaction) => {
      const excluidos = await this.panfletoModel.destroy({ where: { id, tenantId, filialId }, transaction });
      if (excluidos === 0) throw naoEncontrado();
      this.emitirAposCommit(transaction, tenantId, filialId);
    });
  }

  /** O lock na linha da filial serializa as escritas de panfleto da mesma filial (RN16 sob concorrência). */
  private travarFilial(tenantId: string, filialId: string, transaction: Transaction): Promise<Filial> {
    return this.filiais.obter(tenantId, filialId, { transaction, lock: transaction.LOCK.UPDATE });
  }

  private async travarPanfleto(
    tenantId: string,
    filialId: string,
    id: string,
    transaction: Transaction,
  ): Promise<Panfleto> {
    // excluído também dá 404 aqui: o paranoid está ativo
    const panfleto = await this.panfletoModel.findOne({
      where: { id, tenantId, filialId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!panfleto) throw naoEncontrado();
    return panfleto;
  }

  private async garantirSemConflito(
    tenantId: string,
    filialId: string,
    novo: { dataInicio: DataISO; dataLimite: DataISO | null },
    transaction: Transaction,
    ignorarId?: string,
  ): Promise<void> {
    const existentes = (await this.panfletoModel.findAll({
      where: { tenantId, filialId },
      attributes: ATRIBUTOS_PERIODO,
      raw: true,
      transaction,
    })) as unknown as PeriodoPanfleto[];
    const conflito = encontrarConflito(novo, existentes, ignorarId);
    if (!conflito) return;
    const codigo =
      conflito.tipo === 'SEM_DATA_LIMITE'
        ? CodigoErro.PANFLETO_ATUAL_SEM_DATA_LIMITE
        : CodigoErro.PANFLETO_PERIODO_SOBREPOSTO;
    const { id, dataInicio, dataLimite } = conflito.com;
    throw new AppError(codigo, undefined, { conflitoCom: { id, dataInicio, dataLimite } });
  }

  private emitirAposCommit(transaction: Transaction, tenantId: string, filialId: string): void {
    transaction.afterCommit(() => {
      this.eventos.emit(EVENTO_CONTEUDO_ALTERADO, { tenantId, filialId });
    });
  }

  /** D3.4: o arquivo enviado antes de uma falha de banco fica no storage; só registramos. */
  private registrarOrfao(caminho: string | null, tenantId: string, err: unknown): void {
    if (caminho === null) return;
    this.logger.warn({
      evento: 'midia.arquivo_orfao',
      caminho,
      tenantId,
      erro: mensagemDeErro(err),
    });
  }

  private view(panfleto: Panfleto, hoje: DataISO): PanfletoView {
    return panfletoView(panfleto, hoje, this.midia.urlPublica(panfleto.imagemPath) as string);
  }
}
