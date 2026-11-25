import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';
import { ClockService } from '../../../common/clock/clock.service';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { naoEncontrado } from '../../../common/errors/errors';
import { VERSAO_TERMOS } from '../domain/termos';
import { CadastrarLojistaDto } from '../dtos/cadastrar-lojista.dto';
import { EditarLojistaDto } from '../dtos/editar-lojista.dto';
import { LojistaAtivacao } from '../models/lojista-ativacao.model';
import { Lojista } from '../models/lojista.model';
import { StatusLojista } from '../models/status-lojista';
import { SenhaService } from './senha.service';

export interface LojistaComStatus {
  lojista: Lojista;
  status: StatusLojista;
}

const INCLUIR_STATUS = { model: LojistaAtivacao, attributes: ['status'] };

const CAMPOS_EDITAVEIS = ['nomeFantasia', 'nomeResponsavel', 'whatsapp', 'cnpj'] as const;

@Injectable()
export class LojistasService {
  private readonly logger = new Logger(LojistasService.name);

  constructor(
    @InjectModel(Lojista) private readonly lojistaModel: typeof Lojista,
    @InjectModel(LojistaAtivacao) private readonly ativacaoModel: typeof LojistaAtivacao,
    private readonly sequelize: Sequelize,
    private readonly senhaService: SenhaService,
    private readonly clock: ClockService,
  ) {}

  async cadastrar(dto: CadastrarLojistaDto): Promise<LojistaComStatus> {
    const existente = await this.lojistaModel.findOne({ where: { email: dto.email }, attributes: ['id'] });
    if (existente) throw new AppError(CodigoErro.EMAIL_JA_CADASTRADO);

    // fora da transação, para não segurar conexão durante o argon2
    const senhaHash = await this.senhaService.gerarHash(dto.senha);

    // corrida de e-mail: o UNIQUE do banco recusa e o filtro global converte em EMAIL_JA_CADASTRADO
    const lojista = await this.sequelize.transaction(async (transaction) => {
      const criado = await this.lojistaModel.create(
        {
          id: uuidv7(),
          nomeFantasia: dto.nomeFantasia,
          nomeResponsavel: dto.nomeResponsavel,
          email: dto.email,
          senhaHash,
          whatsapp: dto.whatsapp,
          cnpj: dto.cnpj ?? null,
          // o DTO só passa com aceiteTermos === true
          termosVersao: VERSAO_TERMOS,
          termosAceitosEm: this.clock.agora(),
        },
        { transaction },
      );
      await this.ativacaoModel.create(
        { lojistaId: criado.id, status: StatusLojista.AGUARDANDO_ATIVACAO },
        { transaction },
      );
      return criado;
    });

    return { lojista, status: StatusLojista.AGUARDANDO_ATIVACAO };
  }

  async obterPorTenant(tenantId: string): Promise<LojistaComStatus> {
    const lojista = await this.lojistaModel.findOne({ where: { id: tenantId }, include: [INCLUIR_STATUS] });
    return this.comStatus(lojista);
  }

  async editar(tenantId: string, dto: EditarLojistaDto): Promise<LojistaComStatus> {
    const { lojista, status } = await this.obterPorTenant(tenantId);
    for (const campo of CAMPOS_EDITAVEIS) {
      if (dto[campo] !== undefined) lojista.set(campo, dto[campo] as never);
    }
    if (lojista.changed()) await lojista.save();
    return { lojista, status };
  }

  async buscarParaLogin(email: string): Promise<LojistaComStatus | null> {
    const lojista = await this.lojistaModel
      .scope('comSenha')
      .findOne({ where: { email }, include: [INCLUIR_STATUS] });
    return lojista ? this.comStatus(lojista) : null;
  }

  async obterStatus(tenantId: string): Promise<StatusLojista | null> {
    const ativacao = await this.ativacaoModel.findOne({
      where: { lojistaId: tenantId },
      attributes: ['status'],
    });
    return ativacao?.status ?? null;
  }

  /** RN36: só o administrador redefine, pelo endpoint protegido por X-Admin-Key. */
  async redefinirSenha(lojistaId: string, novaSenha: string): Promise<void> {
    const senhaHash = await this.senhaService.gerarHash(novaSenha);
    const [afetados] = await this.lojistaModel.update({ senhaHash }, { where: { id: lojistaId } });
    if (afetados === 0) throw naoEncontrado();
    this.logger.log({ evento: 'admin.senha_redefinida', lojistaId });
  }

  /**
   * LGPD: encerra a conta a pedido do lojista (rota admin). A página sai do ar (DESATIVADO) e o login é
   * recusado; a anonimização vem 6 meses depois. Idempotente: encerrar de novo mantém a data original.
   */
  async encerrar(lojistaId: string): Promise<void> {
    const agora = this.clock.agora();
    await this.sequelize.transaction(async (transaction) => {
      const lojista = await this.lojistaModel.findOne({
        where: { id: lojistaId },
        attributes: ['id', 'encerradoEm'],
        transaction,
        lock: true,
      });
      if (!lojista) throw naoEncontrado();
      if (lojista.encerradoEm) return;
      await this.lojistaModel.update({ encerradoEm: agora }, { where: { id: lojistaId }, transaction });
      await this.ativacaoModel.update(
        { status: StatusLojista.DESATIVADO },
        { where: { lojistaId }, transaction },
      );
    });
    this.logger.log({ evento: 'admin.conta_encerrada', lojistaId });
  }

  private comStatus(lojista: Lojista | null): LojistaComStatus {
    const status = lojista?.ativacao?.status;
    if (!lojista || !status) throw naoEncontrado();
    return { lojista, status };
  }
}
