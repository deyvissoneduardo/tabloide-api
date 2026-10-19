import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/sequelize';
import { literal, UniqueConstraintError, type Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';
import {
  EVENTO_CONTEUDO_ALTERADO,
  type ConteudoAlteradoEvento,
} from '../../../common/eventos/conteudo-alterado.event';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { naoEncontrado } from '../../../common/errors/errors';
import { VERIFICADOR_LIMITES, type VerificadorLimites } from '../../../common/limites/verificador-limites';
import { AppConfig } from '../../../config/app.config';
import { AuditoriaService, CAMPOS_AUDITADOS } from '../../auditoria/services/auditoria.service';
import { normalizarFuso } from '../../vigencia/domain/fuso';
import { ExclusaoEmCascataFilialRegistry } from '../cascata/exclusao-em-cascata-filial.registry';
import { CriarFilialDto } from '../dtos/criar-filial.dto';
import { EditarFilialDto } from '../dtos/editar-filial.dto';
import { Filial } from '../models/filial.model';
import { GERADOR_CODIGO_PUBLICO, type GeradorCodigoPublico } from './gerador-codigo-publico';

export const MAX_TENTATIVAS_CODIGO = 5;
const CONSTRAINT_CODIGO_PUBLICO = 'filiais_codigo_publico_uk';

const ATRIBUTOS_LISTAGEM = [
  'id',
  'nome',
  'endereco',
  'fusoHorario',
  'codigoPublico',
  'createdAt',
  'updatedAt',
];

const CAMPOS_EDITAVEIS = ['nome', 'endereco', 'fusoHorario'] as const;

function ehColisaoDeCodigo(err: unknown): boolean {
  if (!(err instanceof UniqueConstraintError)) return false;
  const pg =
    (err as { parent?: { constraint?: string }; original?: { constraint?: string } }).parent ?? err.original;
  return (pg as { constraint?: string } | undefined)?.constraint === CONSTRAINT_CODIGO_PUBLICO;
}

function fusoOuErro(fuso: string): string {
  const normalizado = normalizarFuso(fuso);
  if (!normalizado) throw new AppError(CodigoErro.FUSO_HORARIO_INVALIDO, undefined, { campo: 'fusoHorario' });
  return normalizado;
}

export interface OpcoesObterFilial {
  transaction?: Transaction;
  lock?: Transaction['LOCK'][keyof Transaction['LOCK']];
}

@Injectable()
export class FiliaisService {
  private readonly logger = new Logger(FiliaisService.name);

  constructor(
    @InjectModel(Filial) private readonly filialModel: typeof Filial,
    private readonly sequelize: Sequelize,
    @Inject(GERADOR_CODIGO_PUBLICO) private readonly gerador: GeradorCodigoPublico,
    private readonly cascata: ExclusaoEmCascataFilialRegistry,
    @Inject(VERIFICADOR_LIMITES) private readonly limites: VerificadorLimites,
    private readonly auditoria: AuditoriaService,
    private readonly eventos: EventEmitter2,
    private readonly config: AppConfig,
  ) {}

  async listar(
    tenantId: string,
    p: { pagina: number; porPagina: number },
  ): Promise<{ itens: Filial[]; total: number }> {
    const { rows, count } = await this.filialModel.findAndCountAll({
      where: { tenantId },
      attributes: ATRIBUTOS_LISTAGEM,
      order: [
        [literal('nome COLLATE "pt-BR-x-icu"'), 'ASC'],
        ['id', 'ASC'],
      ],
      limit: p.porPagina,
      offset: (p.pagina - 1) * p.porPagina,
    });
    return { itens: rows, total: count };
  }

  /** Ponto único para outras fases validarem que a filial do path é do tenant. Excluída também dá 404. */
  async obter(tenantId: string, id: string, opts: OpcoesObterFilial = {}): Promise<Filial> {
    const filial = await this.filialModel.findOne({
      where: { id, tenantId },
      transaction: opts.transaction,
      lock: opts.lock,
    });
    if (!filial) throw naoEncontrado();
    return filial;
  }

  async criar(tenantId: string, dto: CriarFilialDto): Promise<Filial> {
    const fusoHorario = fusoOuErro(dto.fusoHorario ?? this.config.fusoHorarioPadrao);

    return this.sequelize.transaction(async (transaction) => {
      await this.limites.verificarCriacaoFilial(tenantId, { transaction });
      const filial = await this.criarComCodigoUnico(
        { id: uuidv7(), tenantId, nome: dto.nome, endereco: dto.endereco, fusoHorario },
        transaction,
      );
      await this.auditoria.registrarCriacao(
        tenantId,
        'FILIAL',
        filial.id,
        { fusoHorario },
        CAMPOS_AUDITADOS.FILIAL,
        {
          transaction,
        },
      );
      this.emitirAposCommit(transaction, { tenantId, filialId: filial.id });
      return filial;
    });
  }

  async editar(tenantId: string, id: string, dto: EditarFilialDto): Promise<Filial> {
    const novos: Partial<Record<(typeof CAMPOS_EDITAVEIS)[number], string>> = {};
    for (const campo of CAMPOS_EDITAVEIS) if (dto[campo] !== undefined) novos[campo] = dto[campo];
    if (novos.fusoHorario !== undefined) novos.fusoHorario = fusoOuErro(novos.fusoHorario);

    return this.sequelize.transaction(async (transaction) => {
      const filial = await this.obter(tenantId, id, { transaction, lock: transaction.LOCK.UPDATE });
      const antes = { fusoHorario: filial.fusoHorario };
      filial.set(novos);
      await filial.save({ transaction });

      if (novos.fusoHorario !== undefined) {
        await this.auditoria.registrarAlteracoes(
          tenantId,
          'FILIAL',
          id,
          antes,
          { fusoHorario: filial.fusoHorario },
          CAMPOS_AUDITADOS.FILIAL,
          { transaction },
        );
      }
      this.emitirAposCommit(transaction, { tenantId, filialId: id });
      return filial;
    });
  }

  /** RN12/RN25: exclui logicamente a filial e tudo dela; um erro em qualquer handler desfaz tudo. */
  async excluir(tenantId: string, id: string): Promise<void> {
    await this.sequelize.transaction(async (transaction) => {
      // o lock serializa com edições e com cadastros de itens filhos da filial
      const filial = await this.obter(tenantId, id, { transaction, lock: transaction.LOCK.UPDATE });
      for (const handler of this.cascata.listar()) {
        const quantidade = await handler.excluirPorFilial(tenantId, id, { transaction });
        this.logger.debug({ evento: 'filial.cascata', handler: handler.nome, quantidade });
      }
      await filial.destroy({ transaction });
      this.emitirAposCommit(transaction, { tenantId, filialId: id });
    });
  }

  private async criarComCodigoUnico(
    dados: Omit<Filial['_creationAttributes'], 'codigoPublico'>,
    transaction: Transaction,
  ): Promise<Filial> {
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_CODIGO; tentativa += 1) {
      try {
        // savepoint: uma colisão não aborta a transação externa
        return await this.sequelize.transaction({ transaction }, (savepoint) =>
          this.filialModel.create(
            { ...dados, codigoPublico: this.gerador.gerar() },
            { transaction: savepoint },
          ),
        );
      } catch (err) {
        if (!ehColisaoDeCodigo(err)) throw err;
        this.logger.warn({ evento: 'filial.codigo_colidiu', tentativa });
      }
    }
    this.logger.error({ evento: 'filial.codigo_esgotado', tentativas: MAX_TENTATIVAS_CODIGO });
    throw new Error('falha ao gerar código público único');
  }

  private emitirAposCommit(transaction: Transaction, evento: ConteudoAlteradoEvento): void {
    transaction.afterCommit(() => {
      this.eventos.emit(EVENTO_CONTEUDO_ALTERADO, evento);
    });
  }
}
