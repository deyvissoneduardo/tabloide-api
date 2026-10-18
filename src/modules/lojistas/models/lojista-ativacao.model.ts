import { BelongsTo, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { Lojista } from './lojista.model';
import { StatusLojista } from './status-lojista';

export interface AtributosLojistaAtivacao {
  lojistaId: string;
  status: StatusLojista;
  funcionalidades: Record<string, boolean>;
  observacao: string | null;
  atualizadoEm: Date;
}

export type AtributosCriacaoLojistaAtivacao = Pick<AtributosLojistaAtivacao, 'lojistaId' | 'status'>;

/** Tabela de ativação (RN03/RN04): o administrador altera direto no banco; não há rota para isso. */
@Table({ tableName: 'lojista_ativacoes', timestamps: false })
export class LojistaAtivacao extends Model<AtributosLojistaAtivacao, AtributosCriacaoLojistaAtivacao> {
  @PrimaryKey
  @ForeignKey(() => Lojista)
  @Column(DataType.UUID)
  declare lojistaId: string;

  @Column(DataType.ENUM(...Object.values(StatusLojista)))
  declare status: StatusLojista;

  @Column(DataType.JSONB)
  declare funcionalidades: Record<string, boolean>;

  @Column(DataType.TEXT)
  declare observacao: string | null;

  @Column(DataType.DATE)
  declare atualizadoEm: Date;

  @BelongsTo(() => Lojista)
  declare lojista?: Lojista;
}
