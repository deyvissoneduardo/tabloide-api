import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/sequelize';
import type { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { EVENTO_CONTEUDO_ALTERADO } from '../../../common/eventos/conteudo-alterado.event';
import { naoEncontrado } from '../../../common/errors/errors';
import { mensagemDeErro } from '../../../common/errors/mensagem-de-erro';
import type { PerfilImagem } from '../../midia/domain/perfis-imagem';
import { MidiaService } from '../../midia/services/midia.service';
import {
  aplicarEdicao,
  normalizarConfiguracao,
  type ConfiguracaoPaginaGuardada,
  type EdicaoConfiguracaoPagina,
} from '../domain/configuracao-pagina';
import type { EditarConfiguracaoPaginaDto } from '../dtos/editar-configuracao-pagina.dto';
import { Lojista } from '../models/lojista.model';
import { configuracaoPaginaView, type ConfiguracaoPaginaView } from '../views/configuracao-pagina.view';

const ATRIBUTOS = ['id', 'configuracaoPagina'];

/**
 * Aparência da página pública (RN46–RN48), por lojista: vale para todas as filiais, por isso o
 * evento sai sem filialId. Não é auditada (como a identidade). Arquivos antigos ficam no storage.
 */
@Injectable()
export class ConfiguracaoPaginaService {
  private readonly logger = new Logger(ConfiguracaoPaginaService.name);

  constructor(
    private readonly sequelize: Sequelize,
    @InjectModel(Lojista) private readonly lojistaModel: typeof Lojista,
    private readonly midia: MidiaService,
    private readonly eventos: EventEmitter2,
  ) {}

  async obter(tenantId: string): Promise<ConfiguracaoPaginaView> {
    const lojista = await this.lojistaModel.findOne({ where: { id: tenantId }, attributes: ATRIBUTOS });
    if (!lojista) throw naoEncontrado();
    return this.view(normalizarConfiguracao(lojista.configuracaoPagina));
  }

  editar(tenantId: string, dto: EditarConfiguracaoPaginaDto): Promise<ConfiguracaoPaginaView> {
    return this.alterar(tenantId, {
      banner: dto.banner,
      exibirNomeCategoria: dto.exibirNomeCategoria,
      cores: dto.cores,
    });
  }

  /** Logo próprio do banner (perfil logo, 512 px). */
  trocarLogoBanner(tenantId: string, arquivo: Buffer): Promise<ConfiguracaoPaginaView> {
    return this.trocarImagem(tenantId, arquivo, 'logo', (caminho) => ({ banner: { logoPath: caminho } }));
  }

  /** Foto da campanha (perfil banner, 1600 px): substitui a descrição. */
  trocarFotoBanner(tenantId: string, arquivo: Buffer): Promise<ConfiguracaoPaginaView> {
    return this.trocarImagem(tenantId, arquivo, 'banner', (caminho) => ({ banner: { fotoPath: caminho } }));
  }

  /** Sem logo: no-op, sem evento. */
  removerLogoBanner(tenantId: string): Promise<ConfiguracaoPaginaView> {
    return this.alterar(tenantId, { banner: { logoPath: null } });
  }

  /** Só remove se a campanha for FOTO; com DESCRICAO (ou sem campanha) nada muda. */
  removerFotoBanner(tenantId: string): Promise<ConfiguracaoPaginaView> {
    return this.alterar(tenantId, { banner: { fotoPath: null } });
  }

  /** Falha no banco depois do upload só gera log de órfão (o arquivo nunca é apagado). */
  private async trocarImagem(
    tenantId: string,
    arquivo: Buffer,
    perfil: PerfilImagem,
    edicao: (caminho: string) => EdicaoConfiguracaoPagina,
  ): Promise<ConfiguracaoPaginaView> {
    const imagem = await this.midia.processar(tenantId, arquivo, perfil);
    const caminho = await this.midia.salvar(tenantId, perfil, imagem);
    try {
      return await this.alterar(tenantId, edicao(caminho));
    } catch (err) {
      this.logger.warn({ evento: 'midia.arquivo_orfao', caminho, tenantId, erro: mensagemDeErro(err) });
      throw err;
    }
  }

  /**
   * Lê com a linha travada (dois aparelhos não se sobrescrevem campo a campo), aplica a edição e
   * grava. Sem mudança, não escreve nem emite.
   */
  private alterar(tenantId: string, edicao: EdicaoConfiguracaoPagina): Promise<ConfiguracaoPaginaView> {
    return this.sequelize.transaction(async (transaction) => {
      const lojista = await this.lojistaModel.findOne({
        where: { id: tenantId },
        attributes: ATRIBUTOS,
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!lojista) throw naoEncontrado();
      const atual = normalizarConfiguracao(lojista.configuracaoPagina);
      const nova = aplicarEdicao(atual, edicao);
      if (JSON.stringify(nova) !== JSON.stringify(atual)) {
        await this.lojistaModel.update(
          { configuracaoPagina: nova },
          { where: { id: tenantId }, transaction },
        );
        this.emitirAposCommit(transaction, tenantId);
      }
      return this.view(nova);
    });
  }

  private view(config: ConfiguracaoPaginaGuardada): ConfiguracaoPaginaView {
    return configuracaoPaginaView(config, (caminho) => this.midia.urlPublica(caminho) as string);
  }

  private emitirAposCommit(transaction: Transaction, tenantId: string): void {
    transaction.afterCommit(() => {
      this.eventos.emit(EVENTO_CONTEUDO_ALTERADO, { tenantId });
    });
  }
}
