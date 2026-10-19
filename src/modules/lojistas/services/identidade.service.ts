import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/sequelize';
import { EVENTO_CONTEUDO_ALTERADO } from '../../../common/eventos/conteudo-alterado.event';
import { naoEncontrado } from '../../../common/errors/errors';
import { mensagemDeErro } from '../../../common/errors/mensagem-de-erro';
import { MidiaService } from '../../midia/services/midia.service';
import type { EditarIdentidadeDto } from '../dtos/editar-identidade.dto';
import { Lojista } from '../models/lojista.model';
import { identidadeView, type IdentidadeView } from '../views/identidade.view';

const ATRIBUTOS_IDENTIDADE = ['id', 'nomeFantasia', 'corPrimaria', 'corSecundaria', 'logoPath'];

/**
 * Identidade visual do lojista (RN06): vale para todas as filiais, por isso o evento sai sem filialId.
 * Não é auditada: não é preço nem data.
 */
@Injectable()
export class IdentidadeService {
  private readonly logger = new Logger(IdentidadeService.name);

  constructor(
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
    return identidadeView(lojista, this.midia.urlPublica(lojista.logoPath ?? null));
  }

  async editar(tenantId: string, dto: EditarIdentidadeDto): Promise<IdentidadeView> {
    const campos: { nomeFantasia?: string; corPrimaria?: string | null; corSecundaria?: string | null } = {};
    if (dto.nomeFantasia !== undefined) campos.nomeFantasia = dto.nomeFantasia;
    if (dto.corPrimaria !== undefined) campos.corPrimaria = dto.corPrimaria;
    if (dto.corSecundaria !== undefined) campos.corSecundaria = dto.corSecundaria;
    await this.lojistaModel.update(campos, { where: { id: tenantId } });
    this.emitir(tenantId);
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
