import { Op } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { MODELOS_TENANT_SCOPED } from './tenant-scoped.decorator';

declare module 'sequelize' {
  interface FindOptions {
    /** Exceção explícita à trava de tenant (só o módulo público usa). */
    skipTenantScope?: boolean;
  }
  interface CountOptions {
    skipTenantScope?: boolean;
  }
}

export class TenantScopeViolationError extends Error {
  constructor(modelo: string, operacao: string) {
    super(`Consulta em ${modelo} (${operacao}) sem filtro de tenantId.`);
    this.name = 'TenantScopeViolationError';
  }
}

type Objeto = Record<string | symbol, unknown>;

const ehObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v);
const ehTextoPreenchido = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function valorDeTenantValido(valor: unknown): boolean {
  if (ehTextoPreenchido(valor)) return true;
  if (!ehObjeto(valor)) return false;
  if (Op.eq in valor) return ehTextoPreenchido(valor[Op.eq]);
  if (Op.in in valor) {
    const lista = valor[Op.in];
    return Array.isArray(lista) && lista.length === 1 && ehTextoPreenchido(lista[0]);
  }
  return false;
}

/** true se o where restringe a consulta a um único tenant. */
export function exigeTenantNoWhere(where: unknown): boolean {
  if (!ehObjeto(where)) return false;
  if (valorDeTenantValido(where.tenantId) || valorDeTenantValido(where.tenant_id)) return true;

  const e = where[Op.and];
  if (Array.isArray(e)) return e.some(exigeTenantNoWhere);
  if (ehObjeto(e)) return exigeTenantNoWhere(e);
  return false;
}

interface OpcoesComWhere {
  where?: unknown;
  skipTenantScope?: boolean;
}

function verificarOpcoes(modelo: string, operacao: string, opcoes: OpcoesComWhere | undefined): void {
  if (opcoes?.skipTenantScope === true) return;
  if (!exigeTenantNoWhere(opcoes?.where)) throw new TenantScopeViolationError(modelo, operacao);
}

function verificarInstancia(
  modelo: string,
  operacao: string,
  instancia: { get(chave: string): unknown },
): void {
  if (!ehTextoPreenchido(instancia.get('tenantId'))) throw new TenantScopeViolationError(modelo, operacao);
}

export function registrarHooksDeTenant(sequelize: Sequelize): void {
  for (const modelo of Object.values(sequelize.models)) {
    if (!MODELOS_TENANT_SCOPED.has(modelo)) continue;
    const nome = modelo.name;

    for (const hook of [
      'beforeFind',
      'beforeCount',
      'beforeBulkUpdate',
      'beforeBulkDestroy',
      'beforeBulkRestore',
    ] as const) {
      modelo.addHook(hook, 'travaDeTenant', (opcoes: OpcoesComWhere) => verificarOpcoes(nome, hook, opcoes));
    }
    for (const hook of ['beforeUpdate', 'beforeDestroy'] as const) {
      modelo.addHook(hook, 'travaDeTenant', (instancia: { get(chave: string): unknown }) =>
        verificarInstancia(nome, hook, instancia),
      );
    }
    modelo.addHook(
      'beforeSave',
      'travaDeTenant',
      (instancia: { isNewRecord: boolean; get(chave: string): unknown }) => {
        if (!instancia.isNewRecord) verificarInstancia(nome, 'beforeSave', instancia);
      },
    );
  }
}
