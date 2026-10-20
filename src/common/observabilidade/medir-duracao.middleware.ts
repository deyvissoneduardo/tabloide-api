import type { NextFunction, Request, Response } from 'express';
import type { MetricasService } from './metricas.service';

/**
 * Histograma http_request_duration_seconds. A rota é o padrão registrado (ex.:
 * /v1/publico/filiais/:codigo), nunca a URL real: códigos e ids não viram labels.
 */
export function medirDuracao(metricas: MetricasService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const fim = metricas.duracaoHttp.startTimer();
    res.on('finish', () => {
      const rota = req.route?.path ? `${req.baseUrl}${String(req.route.path)}` : 'nao-mapeada';
      fim({ metodo: req.method, rota, status: String(res.statusCode) });
    });
    next();
  };
}
