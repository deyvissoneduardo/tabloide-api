import type { Server } from 'node:http';
import type {
  CorsOptions,
  CorsOptionsDelegate,
} from '@nestjs/common/interfaces/external/cors-options.interface';

const METODOS_PAINEL = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

/**
 * CORS por prefixo (seção 11.1): a página pública é aberta só para leitura, o painel só para
 * as origens configuradas (com credenciais) e admin/saúde não têm CORS.
 */
export function corsPorRota(origensPainel: readonly string[]): CorsOptionsDelegate<{ url?: string }> {
  return (req, callback) => {
    const caminho = req.url ?? '';
    let opcoes: CorsOptions = { origin: false };
    if (caminho.startsWith('/v1/publico')) {
      opcoes = { origin: '*', methods: ['GET', 'HEAD'], credentials: false };
    } else if (caminho.startsWith('/v1/painel') || caminho.startsWith('/v1/auth')) {
      opcoes = { origin: [...origensPainel], methods: METODOS_PAINEL, credentials: true };
    }
    callback(null, opcoes);
  };
}

/** Requisições presas são cortadas; o keep-alive passa do idle timeout do load balancer (60 s). */
export function configurarTimeouts(servidor: Server): void {
  servidor.requestTimeout = 30_000;
  servidor.headersTimeout = 15_000;
  servidor.keepAliveTimeout = 65_000;
}
