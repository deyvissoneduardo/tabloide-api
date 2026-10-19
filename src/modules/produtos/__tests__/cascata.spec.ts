import type { Transaction } from 'sequelize';
import { CategoriasExclusaoCascata } from '../../categorias/cascata/categorias-exclusao-cascata';
import { CategoriasModule } from '../../categorias/categorias.module';
import type { Categoria } from '../../categorias/models/categoria.model';
import { ExclusaoEmCascataFilialRegistry } from '../../filiais/cascata/exclusao-em-cascata-filial.registry';
import { PanfletosExclusaoCascata } from '../../panfletos/cascata/panfletos-exclusao-cascata';
import type { Panfleto } from '../../panfletos/models/panfleto.model';
import { PanfletosModule } from '../../panfletos/panfletos.module';
import { ProdutosExclusaoCascata } from '../cascata/produtos-exclusao-cascata';
import type { Produto } from '../models/produto.model';
import { ProdutosModule } from '../produtos.module';

describe('Funcionalidade: Exclusão em cascata da filial (RN12)', () => {
  const produtoModel = { destroy: jest.fn().mockResolvedValue(5) };
  const categoriaModel = { destroy: jest.fn().mockResolvedValue(2) };
  const produtos = new ProdutosExclusaoCascata(produtoModel as unknown as typeof Produto);
  const categorias = new CategoriasExclusaoCascata(categoriaModel as unknown as typeof Categoria);
  const t = { id: 'tx' } as unknown as Transaction;

  describe('Cenário: produtos da filial', () => {
    it('Então Produto.destroy por tenant e filial, na mesma transação', async () => {
      await expect(produtos.excluirPorFilial('t1', 'f1', { transaction: t })).resolves.toBe(5);
      expect(produtoModel.destroy).toHaveBeenCalledWith({
        where: { tenantId: 't1', filialId: 'f1' },
        transaction: t,
      });
    });
  });

  describe('Cenário: categorias da filial', () => {
    it('Então Categoria.destroy por tenant e filial, na mesma transação', async () => {
      await expect(categorias.excluirPorFilial('t1', 'f1', { transaction: t })).resolves.toBe(2);
      expect(categoriaModel.destroy).toHaveBeenCalledWith({
        where: { tenantId: 't1', filialId: 'f1' },
        transaction: t,
      });
    });
  });

  describe('Cenário: registro no registry da Fase 2', () => {
    it('Então "produtos" (10) vem antes de "categorias" (20) e de "panfletos" (30)', () => {
      const registry = new ExclusaoEmCascataFilialRegistry();
      const panfletos = new PanfletosExclusaoCascata({} as typeof Panfleto);
      new PanfletosModule(registry, panfletos).onModuleInit();
      new CategoriasModule(registry, categorias).onModuleInit();
      new ProdutosModule(registry, produtos).onModuleInit();
      expect(registry.listar().map((h) => [h.nome, h.ordem])).toEqual([
        ['produtos', 10],
        ['categorias', 20],
        ['panfletos', 30],
      ]);
    });
  });
});
