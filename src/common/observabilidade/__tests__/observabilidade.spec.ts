import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../../../config/app.config';
import { DesligamentoService } from '../desligamento.service';
import { medirDuracao } from '../medir-duracao.middleware';
import { MetricasService } from '../metricas.service';

describe('Funcionalidade: Desligamento gracioso', () => {
  const config = (drenagemMs: number) => ({ desligamento: { drenagemMs, timeoutMs: 10_000 } }) as AppConfig;

  afterEach(() => jest.useRealTimers());

  describe('Cenário: SIGTERM marca o desligamento e espera a drenagem', () => {
    it('Então emDesligamento vira true na hora e a promessa só resolve após a drenagem', async () => {
      jest.useFakeTimers();
      const servico = new DesligamentoService(config(5000));
      let terminou = false;
      const promessa = servico.beforeApplicationShutdown('SIGTERM').then(() => (terminou = true));
      expect(servico.emDesligamento).toBe(true);
      await jest.advanceTimersByTimeAsync(4999);
      expect(terminou).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await promessa;
      expect(terminou).toBe(true);
    });
  });

  describe('Cenário: app.close() sem sinal não espera', () => {
    it('Então resolve imediatamente', async () => {
      const servico = new DesligamentoService(config(5000));
      expect(servico.emDesligamento).toBe(false);
      await servico.beforeApplicationShutdown();
      expect(servico.emDesligamento).toBe(true);
    });
  });
});

describe('Funcionalidade: Métricas', () => {
  describe('Cenário: texto Prometheus com as métricas da Fase 5', () => {
    it('Então traz duração HTTP, cache público e pool', async () => {
      const metricas = new MetricasService();
      metricas.contarCache('hit');
      const texto = await metricas.texto();
      for (const nome of [
        'http_request_duration_seconds',
        'publico_cache_total',
        'db_pool_em_uso',
        'db_pool_espera',
      ])
        expect(texto).toContain(nome);
      expect(texto).toContain('publico_cache_total{resultado="hit"} 1');
    });
  });

  describe('Cenário: duração por rota registrada, não pela URL', () => {
    const medir = async (req: Partial<Request>) => {
      const metricas = new MetricasService();
      const res = Object.assign(new EventEmitter(), { statusCode: 200 }) as unknown as Response;
      const next = jest.fn() as NextFunction;
      medirDuracao(metricas)(req as Request, res, next);
      expect(next).toHaveBeenCalled();
      res.emit('finish');
      return metricas.texto();
    };

    it('Então usa baseUrl + route.path', async () =>
      expect(
        await medir({ method: 'GET', baseUrl: '', route: { path: '/v1/publico/filiais/:codigo' } }),
      ).toContain('rota="/v1/publico/filiais/:codigo",status="200"'));

    it('E rota não mapeada vira "nao-mapeada"', async () =>
      expect(await medir({ method: 'GET', baseUrl: '' })).toContain('rota="nao-mapeada"'));
  });
});
