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
import { CAMPOS_ENDERECO, type EnderecoFilial } from '../domain/endereco';
import { CriarFilialDto } from '../dtos/criar-filial.dto';
import { EditarFilialDto } from '../dtos/editar-filial.dto';
import type { EnderecoFilialDto } from '../dtos/endereco-filial.dto';
import { FilialEndereco } from '../models/filial-endereco.model';
import { Filial } from '../models/filial.model';
import { GERADOR_CODIGO_PUBLICO, type GeradorCodigoPublico } from './gerador-codigo-publico';

export const MAX_TENTATIVAS_CODIGO = 5;
const CONSTRAINT_CODIGO_PUBLICO = 'filiais_codigo_publico_uk';

const ATRIBUTOS_LISTAGEM = ['id', 'nome', 'fusoHorario', 'codigoPublico', 'createdAt', 'updatedAt'];

const CAMPOS_EDITAVEIS = ['nome', 'fusoHorario'] as const;

/** LEFT JOIN: filial anterior ao endereço estruturado vem com endereco null. */
const incluirEndereco = (tenantId: string) => ({
  model: FilialEndereco,
  attributes: [...CAMPOS_ENDERECO],
  where: { tenantId },
  required: false,
});

const dadosDoEndereco = (dto: EnderecoFilialDto): EnderecoFilial => ({
  cep: dto.cep,
  logradouro: dto.logradouro,
  numero: dto.numero,
  complemento: dto.complemento ?? null,
  bairro: dto.bairro,
  cidade: dto.cidade,
  uf: dto.uf,
});

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
  /** Só para a resposta da própria filial; as outras fases só validam o dono. */
  comEndereco?: boolean;
}

@Injectable()
export class FiliaisService {
  private readonly logger = new Logger(FiliaisService.name);

  constructor(
    @InjectModel(Filial) private readonly filialModel: typeof Filial,
    @InjectModel(FilialEndereco) private readonly enderecoModel: typeof FilialEndereco,
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
      include: [incluirEndereco(tenantId)],
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
      include: opts.comEndereco ? [incluirEndereco(tenantId)] : undefined,
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
        { id: uuidv7(), tenantId, nome: dto.nome, fusoHorario },
        transaction,
      );
      filial.endereco = await this.enderecoModel.create(
        { filialId: filial.id, tenantId, ...dadosDoEndereco(dto.endereco) },
        { transaction },
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
      filial.endereco = await this.salvarEndereco(tenantId, id, dto.endereco, transaction);

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

  /** O lock da filial (em editar) serializa a troca do endereço. */
  private async salvarEndereco(
    tenantId: string,
    filialId: string,
    dto: EnderecoFilialDto | undefined,
    transaction: Transaction,
  ): Promise<FilialEndereco | null> {
    const atual = await this.enderecoModel.findOne({ where: { filialId, tenantId }, transaction });
    if (!dto) return atual;
    if (!atual) {
      return this.enderecoModel.create({ filialId, tenantId, ...dadosDoEndereco(dto) }, { transaction });
    }
    atual.set(dadosDoEndereco(dto));
    return atual.save({ transaction });
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
