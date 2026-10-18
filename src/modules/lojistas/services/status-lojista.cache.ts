import { LRUCache } from 'lru-cache';
import { StatusLojista } from '../models/status-lojista';

export const STATUS_CACHE_MAX_ENTRADAS = 10_000;

/**
 * Cache do status por tenant. O administrador muda o status direto no banco,
 * então a mudança leva até ttlMs para valer. Leituras simultâneas do mesmo tenant
 * viram uma única consulta. ttlMs <= 0 desliga o cache.
 */
export class StatusLojistaCache {
  private readonly cache: LRUCache<string, StatusLojista> | null;

  constructor(
    ttlMs: number,
    private readonly carregar: (tenantId: string) => Promise<StatusLojista | null>,
    perf?: { now(): number },
  ) {
    this.cache =
      ttlMs > 0
        ? new LRUCache<string, StatusLojista>({
            max: STATUS_CACHE_MAX_ENTRADAS,
            ttl: ttlMs,
            ttlResolution: 0,
            ...(perf ? { perf } : {}),
            // undefined não é cacheado: lojista inexistente é consultado de novo
            fetchMethod: async (tenantId) => (await this.carregar(tenantId)) ?? undefined,
          })
        : null;
  }

  async obter(tenantId: string): Promise<StatusLojista | null> {
    if (!this.cache) return this.carregar(tenantId);
    return (await this.cache.fetch(tenantId)) ?? null;
  }

  invalidar(tenantId: string): void {
    this.cache?.delete(tenantId);
  }
}
