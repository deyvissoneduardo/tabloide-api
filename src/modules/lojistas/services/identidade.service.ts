import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { EVENTO_CONTEUDO_ALTERADO } from '../../../common/eventos/conteudo-alterado.event';
import { naoEncontrado } from '../../../common/errors/errors';
import { mensagemDeErro } from '../../../common/errors/mensagem-de-erro';
import { MidiaService } from '../../midia/services/midia.service';
import {
  aplicarEdicao,
  normalizarConfiguracao,
  type ConfiguracaoPaginaGuardada,
} from '../domain/configuracao-pagina';
import type { EditarIdentidadeDto } from '../dtos/editar-identidade.dto';
import { Lojista } from '../models/lojista.model';
import { identidadeView, type IdentidadeView } from '../views/identidade.view';

const ATRIBUTOS_IDENTIDADE = ['id', 'nomeFantasia', 'configuracaoPagina', 'logoPath', 'sePanfleto'];

/**
 * Identidade visual do lojista (RN06): vale para todas as filiais, por isso o evento sai sem filialId.
 * Não é auditada: não é preço nem data. As cores vivem em configuracao_pagina.cores (RN48): o contrato
 * corPrimaria/corSecundaria segue para os apps antigos, lendo e gravando no JSON (valor cru, null = padrão).
 */
@Injectable()
export class IdentidadeService {
  private readonly logger = new Logger(IdentidadeService.name);

  constructor(
    private readonly sequelize: Sequelize,
    @InjectModel(Lojista) private readonly lojistaModel: typeof Lojista,
    private readonly midia: MidiaService,
    private readonly eventos: EventEmitter2,
  ) {}

  async obter(tenantId: string): Promise<IdentidadeView> {
    const lojista = await this.lojistaModel.findOne({
      where: { id: tenantId },
      attributes: ATRIBUTOS_IDENTIDADE,
    });
    if (!lojista) throw naoEncontrado();
    const { cores } = normalizarConfiguracao(lojista.configuracaoPagina);
    return identidadeView(lojista, cores, this.midia.urlPublica(lojista.logoPath ?? null));
  }

  async editar(tenantId: string, dto: EditarIdentidadeDto): Promise<IdentidadeView> {
    const campos: {
      nomeFantasia?: string;
      sePanfleto?: boolean;
      configuracaoPagina?: ConfiguracaoPaginaGuardada;
    } = {};
    if (dto.nomeFantasia !== undefined) campos.nomeFantasia = dto.nomeFantasia;
    if (dto.sePanfleto !== undefined) campos.sePanfleto = dto.sePanfleto;
    const temCor = dto.corPrimaria !== undefined || dto.corSecundaria !== undefined;
    await this.sequelize.transaction(async (transaction) => {
      if (temCor) {
        // mesma trava da aparência: não sobrescreve as outras cores editadas ao mesmo tempo
        const lojista = await this.lojistaModel.findOne({
          where: { id: tenantId },
          attributes: ['id', 'configuracaoPagina'],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!lojista) throw naoEncontrado();
        campos.configuracaoPagina = aplicarEdicao(normalizarConfiguracao(lojista.configuracaoPagina), {
          cores: { primaria: dto.corPrimaria, secundaria: dto.corSecundaria },
        });
      }
      await this.lojistaModel.update(campos, { where: { id: tenantId }, transaction });
      transaction.afterCommit(() => this.emitir(tenantId));
    });
    return this.obter(tenantId);
  }

  /** O logo anterior fica no storage; falha no banco depois do upload só gera log de órfão. */
  async trocarLogo(tenantId: string, arquivo: Buffer): Promise<IdentidadeView> {
    const imagem = await this.midia.processar(tenantId, arquivo, 'logo');
    const caminho = await this.midia.salvar(tenantId, 'logo', imagem);
    try {
      await this.lojistaModel.update({ logoPath: caminho }, { where: { id: tenantId } });
    } catch (err) {
      this.logger.warn({
        evento: 'midia.arquivo_orfao',
        caminho,
        tenantId,
        erro: mensagemDeErro(err),
      });
      throw err;
    }
    this.emitir(tenantId);
    return this.obter(tenantId);
  }

  private emitir(tenantId: string): void {
    this.eventos.emit(EVENTO_CONTEUDO_ALTERADO, { tenantId });
  }
}
