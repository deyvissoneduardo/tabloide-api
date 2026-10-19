import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { Transaction } from 'sequelize';
import type { ExclusaoEmCascataFilial } from '../../filiais/cascata/exclusao-em-cascata-filial';
import { Categoria } from '../models/categoria.model';

/** RN12: a exclusão da filial leva as categorias dela, depois dos produtos. Não emite evento. */
@Injectable()
export class CategoriasExclusaoCascata implements ExclusaoEmCascataFilial {
  readonly nome = 'categorias';
  readonly ordem = 20;

  constructor(@InjectModel(Categoria) private readonly categoriaModel: typeof Categoria) {}

  excluirPorFilial(tenantId: string, filialId: string, opts: { transaction: Transaction }): Promise<number> {
    return this.categoriaModel.destroy({ where: { tenantId, filialId }, transaction: opts.transaction });
  }
}
