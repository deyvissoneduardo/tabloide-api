import { Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

export interface AtributosLogErro {
  id: string;
  ocorridoEm: Date;
  requestId: string | null;
  metodo: string | null;
  rota: string | null;
  tipo: string | null;
  mensagem: string;
  stack: string | null;
}

/** Log técnico, sem dados de lojista: não é @TenantScoped. */
@Table({ tableName: 'logs_erro', timestamps: false })
export class LogErro extends Model<AtributosLogErro> {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @Column(DataType.DATE)
  declare ocorridoEm: Date;

  @Column(DataType.STRING(64))
  declare requestId: string | null;

  @Column(DataType.STRING(10))
  declare metodo: string | null;

  @Column(DataType.STRING(500))
  declare rota: string | null;

  @Column(DataType.STRING(100))
  declare tipo: string | null;

  @Column(DataType.TEXT)
  declare mensagem: string;

  @Column(DataType.TEXT)
  declare stack: string | null;
}
