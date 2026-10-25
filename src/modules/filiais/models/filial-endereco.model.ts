import type { CreationOptional } from 'sequelize';
import { BelongsTo, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { TenantScoped } from '../../../database/tenant-scoped.decorator';
import type { EnderecoFilial } from '../domain/endereco';
import { Filial } from './filial.model';

export interface AtributosFilialEndereco extends EnderecoFilial {
  filialId: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AtributosCriacaoFilialEndereco = Omit<AtributosFilialEndereco, 'createdAt' | 'updatedAt'>;

/** Endereço 1:1 da filial. Sem exclusão lógica própria: some junto com a filial (RN25). */
@TenantScoped()
@Table({ tableName: 'filial_enderecos' })
export class FilialEndereco extends Model<AtributosFilialEndereco, AtributosCriacaoFilialEndereco> {
  @PrimaryKey
  @ForeignKey(() => Filial)
  @Column(DataType.UUID)
  declare filialId: string;

  @Column(DataType.UUID)
  declare tenantId: string;

  @Column(DataType.CHAR(8))
  declare cep: string;

  @Column(DataType.STRING(200))
  declare logradouro: string;

  @Column(DataType.STRING(20))
  declare numero: string;

  @Column(DataType.STRING(100))
  declare complemento: string | null;

  @Column(DataType.STRING(100))
  declare bairro: string;

  @Column(DataType.STRING(100))
  declare cidade: string;

  @Column(DataType.STRING(2))
  declare uf: string;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => Filial)
  declare filial?: Filial;
}
