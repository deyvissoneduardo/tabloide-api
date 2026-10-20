import type { CreationOptional } from 'sequelize';
import { Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

export interface AtributosLojistaLimite {
  lojistaId: string;
  maxFiliais: number | null;
  maxProdutosPorFilial: number | null;
  maxImagemBytes: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * RNF12: sem linha ou coluna nula = sem limite. O administrador edita direto no banco.
 * Não é @TenantScoped: a PK já é o tenant e a busca é sempre por PK.
 */
@Table({ tableName: 'lojista_limites' })
export class LojistaLimite extends Model<AtributosLojistaLimite, Pick<AtributosLojistaLimite, 'lojistaId'>> {
  @PrimaryKey
  @Column(DataType.UUID)
  declare lojistaId: string;

  @Column(DataType.INTEGER)
  declare maxFiliais: number | null;

  @Column(DataType.INTEGER)
  declare maxProdutosPorFilial: number | null;

  @Column(DataType.INTEGER)
  declare maxImagemBytes: number | null;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
