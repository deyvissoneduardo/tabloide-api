import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { EVENTO_CONTEUDO_ALTERADO } from '../../../common/eventos/conteudo-alterado.event';
import { mensagemDeErro } from '../../../common/errors/mensagem-de-erro';
import { FiliaisService } from '../../filiais/services/filiais.service';
import { MidiaService } from '../../midia/services/midia.service';
import { VigenciaService } from '../../vigencia/services/vigencia.service';
import type { ProdutoView } from '../views/produto.view';
import { ProdutosService } from './produtos.service';

/** Troca e remoção da foto (D4.1). A foto anterior nunca é apagada do storage (D4.5). */
@Injectable()
export class ProdutoFotoService {
  private readonly logger = new Logger(ProdutoFotoService.name);

  constructor(
    private readonly sequelize: Sequelize,
    private readonly filiais: FiliaisService,
    private readonly vigencia: VigenciaService,
    private readonly produtos: ProdutosService,
    private readonly midia: MidiaService,
    private readonly eventos: EventEmitter2,
  ) {}

  /**
   * A leitura prévia, sem trava, barra produto alheio ou não editável antes de gastar CPU com a
   * imagem. A situação é revalidada com a linha travada: se mudou no meio, a foto nova vira órfã.
   */
  async substituir(tenantId: string, filialId: string, id: string, foto: Buffer): Promise<ProdutoView> {
    const filial = await this.filiais.obter(tenantId, filialId);
    const hoje = this.vigencia.hojeDaFilial(filial);
    await this.produtos.obterEditavel(tenantId, filialId, id, hoje);

    const imagem = await this.midia.processar(tenantId, foto, 'produto');
    const caminho = await this.midia.salvar(tenantId, 'produto', imagem);
    try {
      return await this.sequelize.transaction(async (transaction) => {
        const produto = await this.produtos.obterEditavel(tenantId, filialId, id, hoje, transaction);
        await produto.update({ fotoPath: caminho }, { transaction });
        this.emitirAposCommit(transaction, tenantId, filialId);
        return this.produtos.paraView(produto, hoje, transaction);
      });
    } catch (err) {
      this.logger.warn({ evento: 'midia.arquivo_orfao', caminho, tenantId, erro: mensagemDeErro(err) });
      throw err;
    }
  }

  /** Sem foto: no-op, sem evento. */
  async remover(tenantId: string, filialId: string, id: string): Promise<ProdutoView> {
    const filial = await this.filiais.obter(tenantId, filialId);
    const hoje = this.vigencia.hojeDaFilial(filial);
    return this.sequelize.transaction(async (transaction) => {
      const produto = await this.produtos.obterEditavel(tenantId, filialId, id, hoje, transaction);
      if (produto.fotoPath !== null) {
        await produto.update({ fotoPath: null }, { transaction });
        this.emitirAposCommit(transaction, tenantId, filialId);
      }
      return this.produtos.paraView(produto, hoje, transaction);
    });
  }

  private emitirAposCommit(transaction: Transaction, tenantId: string, filialId: string): void {
    transaction.afterCommit(() => {
      this.eventos.emit(EVENTO_CONTEUDO_ALTERADO, { tenantId, filialId });
    });
  }
}
