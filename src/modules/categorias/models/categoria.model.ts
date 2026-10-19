import type { CreationOptional } from 'sequelize';
import { BeforeSave, Column, DataType, HasMany, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { normalizarParaBusca } from '../../../common/utils/text';
import { TenantScoped } from '../../../database/tenant-scoped.decorator';
import { Produto } from '../../produtos/models/produto.model';

export interface AtributosCategoria {
  id: string;
  tenantId: string;
  filialId: string;
  nome: string;
  nomeNormalizado: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type AtributosCriacaoCategoria = Omit<
  AtributosCategoria,
  'nomeNormalizado' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

/** Categorias próprias de cada filial (RN18). Exclusão lógica (RN25); a cascata é feita no service. */
@TenantScoped()
@Table({ tableName: 'categorias', paranoid: true })
export class Categoria extends Model<AtributosCategoria, AtributosCriacaoCategoria> {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @Column(DataType.UUID)
  declare tenantId: string;

  @Column(DataType.UUID)
  declare filialId: string;

  @Column(DataType.STRING(80))
  declare nome: string;

  /** D4.2: ordenação e busca sem acento; preenchido pelo hook. */
  @Column(DataType.STRING(80))
  declare nomeNormalizado: string;

  @HasMany(() => Produto, { foreignKey: 'categoriaId', constraints: false })
  declare produtos?: Produto[];

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;

  @BeforeSave
  static normalizarNome(categoria: Categoria): void {
    if (categoria.changed('nome')) categoria.nomeNormalizado = normalizarParaBusca(categoria.nome);
  }
}
