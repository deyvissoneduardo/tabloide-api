import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { LRUCache } from 'lru-cache';
import {
  EVENTO_CONTEUDO_ALTERADO,
  type ConteudoAlteradoEvento,
} from '../../../common/eventos/conteudo-alterado.event';
import { MetricasService } from '../../../common/observabilidade/metricas.service';
import type { DataISO } from '../../../common/utils/date-only';
import { AppConfig } from '../../../config/app.config';

export interface PaginaPublicaPronta {
  /** JSON já serializado: o controller não serializa de novo. */
  corpo: string;
  /** O mesmo corpo já em gzip, comprimido uma vez por carga e não a cada requisição. */
  corpoGzip: Buffer;
  etag: string;
  hoje: DataISO;
  /** Uso interno (checagem de virada do dia e índices); nunca serializados. */
  fuso: string;
  tenantId: string;
  filialId: string;
}

export type ResultadoCache = { tipo: 'positivo'; pagina: PaginaPublicaPronta } | { tipo: 'negativo' };

type EntradaCache = ResultadoCache & { expiraEm: number };

/**
 * Cache em memória da página pública (seção 7). Gerações por código evitam que uma carga
 * iniciada antes de uma edição grave dados antigos depois da invalidação; o single-flight
 * faz N requisições simultâneas do mesmo código custarem 1 ida ao banco.
 */
@Injectable()
export class PaginaPublicaCache {
  private readonly lru: LRUCache<string, EntradaCache>;
  private readonly geracoes = new Map<string, number>();
  private readonly porFilial = new Map<string, string>();
  private readonly porTenant = new Map<string, Set<string>>();
  private readonly tenantDoCodigo = new Map<string, { tenantId: string; filialId: string }>();
  private readonly emCarga = new Map<string, Promise<PaginaPublicaPronta>>();
  private readonly desativado: boolean;
  readonly negativoSeg: number;
  readonly ttlMaxSeg: number;

  constructor(
    config: AppConfig,
    private readonly metricas: MetricasService,
  ) {
    const opcoes = config.publicoCache;
    this.desativado = opcoes.desativado;
    this.negativoSeg = opcoes.negativoSeg;
    this.ttlMaxSeg = opcoes.ttlMaxSeg;
    this.lru = new LRUCache<string, EntradaCache>({
      max: opcoes.max,
      // os índices secundários acompanham o LRU para não vazar memória
      disposeAfter: (_valor, codigo, motivo) => {
        if (motivo !== 'set') this.desindexar(codigo);
      },
    });
  }

  get tamanho(): number {
    return this.lru.size;
  }

  obter(codigo: string, agora: Date): ResultadoCache | undefined {
    if (this.desativado) return undefined;
    const entrada = this.lru.get(codigo);
    if (!entrada) return undefined;
    if (entrada.expiraEm <= agora.getTime()) {
      this.lru.delete(codigo);
      return undefined;
    }
    return entrada.tipo === 'positivo' ? { tipo: 'positivo', pagina: entrada.pagina } : { tipo: 'negativo' };
  }

  gravar(codigo: string, pagina: PaginaPublicaPronta, ttlSeg: number, geracao: number, agora: Date): void {
    if (this.desativado || geracao !== this.geracaoAtual(codigo)) return;
    this.indexar(codigo, pagina.tenantId, pagina.filialId);
    this.lru.set(codigo, { tipo: 'positivo', pagina, expiraEm: agora.getTime() + ttlSeg * 1000 });
    this.metricas.entradasCachePublico.set(this.lru.size);
  }

  gravarNegativo(codigo: string, geracao: number, agora: Date): void {
    if (this.desativado || geracao !== this.geracaoAtual(codigo)) return;
    this.lru.set(codigo, { tipo: 'negativo', expiraEm: agora.getTime() + this.negativoSeg * 1000 });
    this.metricas.entradasCachePublico.set(this.lru.size);
  }

  geracaoAtual(codigo: string): number {
    return this.geracoes.get(codigo) ?? 0;
  }

  /**
   * Liga o código à filial e ao tenant assim que a consulta 1 os revela, antes das consultas
   * 2 e 3: um evento que chegue no meio da carga já incrementa a geração do código.
   */
  indexar(codigo: string, tenantId: string, filialId: string): void {
    this.tenantDoCodigo.set(codigo, { tenantId, filialId });
    this.porFilial.set(filialId, codigo);
    let codigos = this.porTenant.get(tenantId);
    if (!codigos) {
      codigos = new Set();
      this.porTenant.set(tenantId, codigos);
    }
    codigos.add(codigo);
  }

  /** true se já há uma carga deste código em andamento (quem chega agora só espera por ela). */
  carregando(codigo: string): boolean {
    return this.emCarga.has(codigo);
  }

  carregarUmaVez(codigo: string, carregar: () => Promise<PaginaPublicaPronta>): Promise<PaginaPublicaPronta> {
    const existente = this.emCarga.get(codigo);
    if (existente) return existente;
    const carga = carregar().finally(() => this.emCarga.delete(codigo));
    this.emCarga.set(codigo, carga);
    return carga;
  }

  /** Com filialId: só aquela filial. Sem: todas do tenant (identidade visual). */
  @OnEvent(EVENTO_CONTEUDO_ALTERADO)
  invalidar(evento: ConteudoAlteradoEvento): void {
    const codigos = evento.filialId
      ? [this.porFilial.get(evento.filialId)].filter((c): c is string => c !== undefined)
      : [...(this.porTenant.get(evento.tenantId) ?? [])];
    for (const codigo of codigos) {
      // o evento só vale para o tenant dono do código
      if (this.tenantDoCodigo.get(codigo)?.tenantId !== evento.tenantId) continue;
      this.geracoes.set(codigo, this.geracaoAtual(codigo) + 1);
      this.lru.delete(codigo);
      this.metricas.contarCache('invalidado');
    }
    this.metricas.entradasCachePublico.set(this.lru.size);
  }

  /** Esvazia o cache (operação e testes). As gerações sobem para descartar cargas em andamento. */
  limpar(): void {
    for (const codigo of this.lru.keys()) this.geracoes.set(codigo, this.geracaoAtual(codigo) + 1);
    this.lru.clear();
    this.metricas.entradasCachePublico.set(0);
  }

  private desindexar(codigo: string): void {
    const dono = this.tenantDoCodigo.get(codigo);
    if (!dono) return;
    this.tenantDoCodigo.delete(codigo);
    if (this.porFilial.get(dono.filialId) === codigo) this.porFilial.delete(dono.filialId);
    const codigos = this.porTenant.get(dono.tenantId);
    codigos?.delete(codigo);
    if (codigos?.size === 0) this.porTenant.delete(dono.tenantId);
  }
}
