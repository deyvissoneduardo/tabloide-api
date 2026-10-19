import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { Transaction } from 'sequelize';
import type { ExclusaoEmCascataFilial } from '../../filiais/cascata/exclusao-em-cascata-filial';
import { Produto } from '../models/produto.model';

/** RN12: a exclusão da filial leva os produtos dela, antes das categorias. Não emite evento. */
@Injectable()
export class ProdutosExclusaoCascata implements ExclusaoEmCascataFilial {
  readonly nome = 'produtos';
  readonly ordem = 10;

  constructor(@InjectModel(Produto) private readonly produtoModel: typeof Produto) {}

  excluirPorFilial(tenantId: string, filialId: string, opts: { transaction: Transaction }): Promise<number> {
    return this.produtoModel.destroy({ where: { tenantId, filialId }, transaction: opts.transaction });
  }
}
