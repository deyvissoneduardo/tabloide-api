import { ExclusaoEmCascataFilialRegistry } from '../../filiais/cascata/exclusao-em-cascata-filial.registry';
import type { Transaction } from 'sequelize';
import { PanfletosExclusaoCascata } from '../cascata/panfletos-exclusao-cascata';
import type { Panfleto } from '../models/panfleto.model';
import { PanfletosModule } from '../panfletos.module';

describe('Funcionalidade: Cascata da filial (RN12)', () => {
  const panfletoModel = { destroy: jest.fn().mockResolvedValue(3) };
  const cascata = new PanfletosExclusaoCascata(panfletoModel as unknown as typeof Panfleto);
  const t = { id: 'tx' } as unknown as Transaction;

  describe('Cenário: exclusão da filial exclui os panfletos', () => {
    it('Então destroy lógico por tenant e filial, na transação da filial', async () => {
      await expect(cascata.excluirPorFilial('t1', 'f1', { transaction: t })).resolves.toBe(3);
      expect(panfletoModel.destroy).toHaveBeenCalledWith({
        where: { tenantId: 't1', filialId: 'f1' },
        transaction: t,
      });
    });
  });

  describe('Cenário: handler registrado no registry da Fase 2', () => {
    it('Então o registry lista "panfletos" com ordem 30', () => {
      const registry = new ExclusaoEmCascataFilialRegistry();
      new PanfletosModule(registry, cascata).onModuleInit();
      expect(registry.listar().map((h) => [h.nome, h.ordem])).toEqual([['panfletos', 30]]);
    });
  });
});
