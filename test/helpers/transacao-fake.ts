import type { Transaction } from 'sequelize';

/** Transação falsa que guarda os callbacks de afterCommit e só os executa no commit. */
export function transacaoFake() {
  const aposCommit: Array<() => unknown> = [];
  const t = {
    LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE', KEY_SHARE: 'KEY SHARE', NO_KEY_UPDATE: 'NO KEY UPDATE' },
    afterCommit: jest.fn((cb: () => unknown) => {
      aposCommit.push(cb);
    }),
    async commit() {
      for (const cb of aposCommit) await cb();
    },
  };
  return t as typeof t & Transaction;
}

/**
 * sequelize.transaction falso: a externa faz commit ao terminar sem erro;
 * a aninhada (savepoint, chamada com opções) só executa o callback.
 */
export function sequelizeFake(t: ReturnType<typeof transacaoFake>) {
  return {
    transaction: jest.fn(async (opcoesOuCb: unknown, cb?: (t: unknown) => unknown) => {
      const fn = (cb ?? opcoesOuCb) as (t: unknown) => unknown;
      const resultado = await fn(t);
      if (!cb) await t.commit();
      return resultado;
    }),
  };
}
