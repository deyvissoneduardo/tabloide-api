import { Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { TenantScoped } from '../../../database/tenant-scoped.decorator';

export type EntidadeAuditada = 'FILIAL' | 'PANFLETO' | 'PRODUTO';

export interface AtributosAuditoriaAlteracao {
  id: string;
  tenantId: string;
  entidade: EntidadeAuditada;
  entidadeId: string;
  campo: string;
  valorAnterior: string | null;
  valorNovo: string | null;
  alteradoEm: Date;
  requestId: string | null;
}

@TenantScoped()
@Table({ tableName: 'auditoria_alteracoes', timestamps: false })
export class AuditoriaAlteracao extends Model<AtributosAuditoriaAlteracao> {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @Column(DataType.UUID)
  declare tenantId: string;

  @Column(DataType.STRING(30))
  declare entidade: EntidadeAuditada;

  @Column(DataType.UUID)
  declare entidadeId: string;

  @Column(DataType.STRING(40))
  declare campo: string;

  @Column(DataType.TEXT)
  declare valorAnterior: string | null;

  @Column(DataType.TEXT)
  declare valorNovo: string | null;

  @Column(DataType.DATE)
  declare alteradoEm: Date;

  @Column(DataType.STRING(64))
  declare requestId: string | null;
}
