import { gzipSync } from 'node:zlib';
import { Injectable } from '@nestjs/common';
import { ClockService } from '../../../common/clock/clock.service';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { MetricasService } from '../../../common/observabilidade/metricas.service';
import { hojeNoFuso, segundosAteMeiaNoite } from '../../../common/utils/date-only';
import { StatusLojista } from '../../lojistas/models/status-lojista';
import { MidiaService } from '../../midia/services/midia.service';
import { codigoPublicoValido } from '../domain/codigo-publico';
import { etagFraco } from '../domain/etag';
import { montarPagina } from '../domain/montar-pagina';
import { paginaPublicaView } from '../views/pagina-publica.view';
import { PaginaPublicaCache, type PaginaPublicaPronta } from './pagina-publica.cache';
import { PaginaPublicaQuery } from './pagina-publica.query';

/** O mesmo 404 para formato inválido, inexistente, filial excluída e lojista não ativo (RN35). */
export const paginaNaoEncontrada = () =>
  new AppError(CodigoErro.RECURSO_NAO_ENCONTRADO, 'Página não encontrada.');

@Injectable()
export class PublicoService {
  constructor(
    private readonly query: PaginaPublicaQuery,
    private readonly cache: PaginaPublicaCache,
    private readonly midia: MidiaService,
    private readonly clock: ClockService,
    private readonly metricas: MetricasService,
  ) {}

  /** Página pronta (JSON serializado + ETag) para o código do QR Code (RN27). */
  async obterPagina(codigo: string): Promise<PaginaPublicaPronta> {
    if (!codigoPublicoValido(codigo)) throw paginaNaoEncontrada();
    const agora = this.clock.agora();

    const emCache = this.cache.obter(codigo, agora);
    if (emCache?.tipo === 'negativo') {
      this.metricas.contarCache('negativo');
      throw paginaNaoEncontrada();
    }
    // na virada do dia a entrada antiga vira miss, mesmo antes do TTL
    if (emCache && emCache.pagina.hoje === hojeNoFuso(emCache.pagina.fuso, agora)) {
      this.metricas.contarCache('hit');
      return emCache.pagina;
    }

    // miss = uma ida ao banco; quem pega carona numa carga em andamento conta como hit
    this.metricas.contarCache(this.cache.carregando(codigo) ? 'hit' : 'miss');
    return this.cache.carregarUmaVez(codigo, () => this.carregar(codigo, agora));
  }

  private async carregar(codigo: string, agora: Date): Promise<PaginaPublicaPronta> {
    const geracao = this.cache.geracaoAtual(codigo);
    const filial = await this.query.buscarFilialPorCodigo(codigo);
    if (!filial || filial.lojista.status !== StatusLojista.ATIVO) {
      this.cache.gravarNegativo(codigo, geracao, agora);
      throw paginaNaoEncontrada();
    }
    this.cache.indexar(codigo, filial.tenantId, filial.id);

    const hoje = hojeNoFuso(filial.fusoHorario, agora);
    const [panfleto, produtos] = await Promise.all([
      this.query.buscarPanfletoVigente(filial.tenantId, filial.id, hoje),
      this.query.buscarProdutosVigentes(filial.tenantId, filial.id, hoje),
    ]);

    const json = paginaPublicaView(
      montarPagina({ filial, panfleto, produtos }),
      (caminho) => this.midia.urlPublica(caminho) as string,
      hoje,
    );
    // geradoEm fica fora do ETag: recarregar sem mudança de dados mantém o 304
    const etag = etagFraco(JSON.stringify(json));
    const corpo = JSON.stringify({ ...json, geradoEm: agora.toISOString() });
    const pronta: PaginaPublicaPronta = {
      corpo,
      corpoGzip: gzipSync(corpo),
      etag,
      hoje,
      fuso: filial.fusoHorario,
      tenantId: filial.tenantId,
      filialId: filial.id,
    };
    const ttl = Math.max(1, Math.min(this.cache.ttlMaxSeg, segundosAteMeiaNoite(filial.fusoHorario, agora)));
    this.cache.gravar(codigo, pronta, ttl, geracao, agora);
    return pronta;
  }
}
