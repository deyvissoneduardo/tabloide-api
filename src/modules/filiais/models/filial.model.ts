import type { CreationOptional } from 'sequelize';
import { Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { TenantScoped } from '../../../database/tenant-scoped.decorator';

export interface AtributosFilial {
  id: string;
  tenantId: string;
  nome: string;
  endereco: string;
  fusoHorario: string;
  codigoPublico: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type AtributosCriacaoFilial = Omit<AtributosFilial, 'createdAt' | 'updatedAt' | 'deletedAt'>;

/** Vitrine independente do lojista (RN09–RN11). Exclusão lógica (RN25). */
@TenantScoped()
@Table({ tableName: 'filiais', paranoid: true })
export class Filial extends Model<AtributosFilial, AtributosCriacaoFilial> {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @Column(DataType.UUID)
  declare tenantId: string;

  @Column(DataType.STRING(120))
  declare nome: string;

  @Column(DataType.STRING(300))
  declare endereco: string;

  @Column(DataType.STRING(64))
  declare fusoHorario: string;

  @Column(DataType.STRING(8))
  declare codigoPublico: string;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;
}
