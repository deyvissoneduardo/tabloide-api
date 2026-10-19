import type { CreationOptional } from 'sequelize';
import { Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';
import type { DataISO } from '../../../common/utils/date-only';
import { TenantScoped } from '../../../database/tenant-scoped.decorator';

export interface AtributosPanfleto {
  id: string;
  tenantId: string;
  filialId: string;
  imagemPath: string;
  imagemLargura: number;
  imagemAltura: number;
  dataInicio: DataISO;
  dataLimite: DataISO | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type AtributosCriacaoPanfleto = Omit<AtributosPanfleto, 'createdAt' | 'updatedAt' | 'deletedAt'>;

/** Uma imagem por panfleto (RN13); no máximo um vigente por filial, sem sobreposição (RN14, RN16). */
@TenantScoped()
@Table({ tableName: 'panfletos', paranoid: true })
export class Panfleto extends Model<AtributosPanfleto, AtributosCriacaoPanfleto> {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @Column(DataType.UUID)
  declare tenantId: string;

  @Column(DataType.UUID)
  declare filialId: string;

  @Column(DataType.TEXT)
  declare imagemPath: string;

  @Column(DataType.INTEGER)
  declare imagemLargura: number;

  @Column(DataType.INTEGER)
  declare imagemAltura: number;

  /** DATEONLY volta como string 'YYYY-MM-DD' no Sequelize 6. */
  @Column(DataType.DATEONLY)
  declare dataInicio: DataISO;

  @Column(DataType.DATEONLY)
  declare dataLimite: DataISO | null;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;
}
