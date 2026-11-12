import { Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { TenantScoped } from '../../../database/tenant-scoped.decorator';
import type { DataISO } from '../../../common/utils/date-only';

export interface AtributosAcessoFilial {
  tenantId: string;
  filialId: string;
  data: DataISO;
  hora: number;
  quantidade: number;
}

/**
 * Acessos à página pública agregados por filial, data e hora locais (RN50–RN52). Sem dado pessoal.
 * A aplicação grava e lê por SQL cru com tenant_id explícito; o model documenta o schema e serve
 * a factories e asserts de teste. Não é paranoid: o lojista nunca apaga nem edita o contador.
 */
@TenantScoped()
@Table({ tableName: 'acessos_filial', timestamps: false, paranoid: false })
export class AcessoFilial extends Model<AtributosAcessoFilial, AtributosAcessoFilial> {
  @Column(DataType.UUID)
  declare tenantId: string;

  @PrimaryKey
  @Column(DataType.UUID)
  declare filialId: string;

  @PrimaryKey
  @Column(DataType.DATEONLY)
  declare data: DataISO;

  @PrimaryKey
  @Column(DataType.SMALLINT)
  declare hora: number;

  @Column(DataType.INTEGER)
  declare quantidade: number;
}
