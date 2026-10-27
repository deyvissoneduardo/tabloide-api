import type { CreationOptional } from 'sequelize';
import { Column, DataType, HasOne, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { LojistaAtivacao } from './lojista-ativacao.model';

export interface AtributosLojista {
  id: string;
  nomeFantasia: string;
  nomeResponsavel: string;
  email: string;
  senhaHash: string;
  whatsapp: string;
  cnpj: string | null;
  logoPath: string | null;
  corPrimaria: string | null;
  corSecundaria: string | null;
  sePanfleto: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type AtributosCriacaoLojista = Omit<
  AtributosLojista,
  'logoPath' | 'corPrimaria' | 'corSecundaria' | 'sePanfleto' | 'createdAt' | 'updatedAt'
>;

/** Lojista é o próprio tenant (tenant_id = lojistas.id); por isso não é @TenantScoped. */
@Table({
  tableName: 'lojistas',
  // o hash da senha só sai do banco quando pedido explicitamente (escopo comSenha)
  defaultScope: { attributes: { exclude: ['senhaHash'] } },
  scopes: { comSenha: { attributes: { include: ['senhaHash'] } } },
})
export class Lojista extends Model<AtributosLojista, AtributosCriacaoLojista> {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @Column(DataType.STRING(120))
  declare nomeFantasia: string;

  @Column(DataType.STRING(120))
  declare nomeResponsavel: string;

  @Column(DataType.CITEXT)
  declare email: string;

  @Column(DataType.TEXT)
  declare senhaHash: string;

  @Column(DataType.STRING(20))
  declare whatsapp: string;

  @Column(DataType.CHAR(14))
  declare cnpj: string | null;

  @Column(DataType.TEXT)
  declare logoPath: CreationOptional<string | null>;

  @Column(DataType.CHAR(7))
  declare corPrimaria: CreationOptional<string | null>;

  @Column(DataType.CHAR(7))
  declare corSecundaria: CreationOptional<string | null>;

  /** RN44: a página pública mostra só o panfleto vigente, quando houver. */
  @Column(DataType.BOOLEAN)
  declare sePanfleto: CreationOptional<boolean>;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  @HasOne(() => LojistaAtivacao)
  declare ativacao?: LojistaAtivacao;
}
