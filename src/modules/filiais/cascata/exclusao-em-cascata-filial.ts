import type { Transaction } from 'sequelize';

export interface ExclusaoEmCascataFilial {
  readonly nome: string;
  readonly ordem: number;
  excluirPorFilial(tenantId: string, filialId: string, opts: { transaction: Transaction }): Promise<number>;
}
