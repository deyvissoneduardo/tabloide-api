import type { CreationOptional } from 'sequelize';
import {
  BeforeSave,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import type { DataISO } from '../../../common/utils/date-only';
import { normalizarParaBusca } from '../../../common/utils/text';
import { TenantScoped } from '../../../database/tenant-scoped.decorator';
import { Categoria } from '../../categorias/models/categoria.model';

export interface AtributosProduto {
  id: string;
  tenantId: string;
  filialId: string;
  categoriaId: string;
  nome: string;
  nomeNormalizado: string;
  quantidade: string | null;
  precoPromocionalCentavos: number;
  precoOriginalCentavos: number | null;
  descricao: string | null;
  observacao: string | null;
  fotoPath: string | null;
  dataInicio: DataISO;
  dataLimite: DataISO | null;
  posicao: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type AtributosCriacaoProduto = Omit<
  AtributosProduto,
  'nomeNormalizado' | 'posicao' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

/** Oferta com preço "de/por" em centavos e vigência (RN19, RN21, RN40, RN42). Exclusão lógica (RN25). */
@TenantScoped()
@Table({ tableName: 'produtos', paranoid: true })
export class Produto extends Model<AtributosProduto, AtributosCriacaoProduto> {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @Column(DataType.UUID)
  declare tenantId: string;

  @Column(DataType.UUID)
  declare filialId: string;

  @ForeignKey(() => Categoria)
  @Column(DataType.UUID)
  declare categoriaId: string;

  @Column(DataType.STRING(120))
  declare nome: string;

  /** D4.2: ordenação e busca sem acento; preenchido pelo hook. */
  @Column(DataType.STRING(120))
  declare nomeNormalizado: string;

  @Column(DataType.STRING(40))
  declare quantidade: string | null;

  @Column(DataType.INTEGER)
  declare precoPromocionalCentavos: number;

  @Column(DataType.INTEGER)
  declare precoOriginalCentavos: number | null;

  @Column(DataType.STRING(500))
  declare descricao: string | null;

  @Column(DataType.STRING(200))
  declare observacao: string | null;

  @Column(DataType.TEXT)
  declare fotoPath: string | null;

  /** DATEONLY volta como string 'YYYY-MM-DD' no Sequelize 6. */
  @Column(DataType.DATEONLY)
  declare dataInicio: DataISO;

  @Column(DataType.DATEONLY)
  declare dataLimite: DataISO | null;

  /** RN45: ordem dentro da categoria; null = não posicionado. */
  @Column(DataType.INTEGER)
  declare posicao: CreationOptional<number | null>;

  @BelongsTo(() => Categoria, { foreignKey: 'categoriaId', constraints: false })
  declare categoria?: Categoria;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;

  @BeforeSave
  static normalizarNome(produto: Produto): void {
    if (produto.changed('nome')) produto.nomeNormalizado = normalizarParaBusca(produto.nome);
  }
}
