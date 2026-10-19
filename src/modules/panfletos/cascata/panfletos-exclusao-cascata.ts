import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { Transaction } from 'sequelize';
import type { ExclusaoEmCascataFilial } from '../../filiais/cascata/exclusao-em-cascata-filial';
import { Panfleto } from '../models/panfleto.model';

/** RN12: a exclusão da filial leva os panfletos dela. Não emite evento: a filial já emite o seu. */
@Injectable()
export class PanfletosExclusaoCascata implements ExclusaoEmCascataFilial {
  readonly nome = 'panfletos';
  readonly ordem = 30;

  constructor(@InjectModel(Panfleto) private readonly panfletoModel: typeof Panfleto) {}

  excluirPorFilial(tenantId: string, filialId: string, opts: { transaction: Transaction }): Promise<number> {
    return this.panfletoModel.destroy({ where: { tenantId, filialId }, transaction: opts.transaction });
  }
}
