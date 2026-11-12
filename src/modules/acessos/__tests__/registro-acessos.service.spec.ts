import type { Sequelize } from 'sequelize-typescript';
import type { ClockService } from '../../../common/clock/clock.service';
import { MetricasService } from '../../../common/observabilidade/metricas.service';
import { REGISTRO_ACESSO_TIMEOUT_MS, RegistroAcessosService } from '../services/registro-acessos.service';

const ACESSO = { tenantId: 't1', filialId: 'f1', fuso: 'America/Manaus' };

describe('Funcionalidade: gravar um acesso à página pública (RN50–RN52, D5)', () => {
  const sequelize = { query: jest.fn() };
  let metricas: MetricasService;
  let service: RegistroAcessosService;

  beforeEach(() => {
    jest.resetAllMocks();
    metricas = new MetricasService();
    jest.spyOn(metricas, 'contarAcessoRegistrado');
    jest.spyOn(metricas, 'contarFalhaRegistroAcesso');
    service = new RegistroAcessosService(
      sequelize as unknown as Sequelize,
      // 00:30 em Brasília = 23:30 do dia anterior em Manaus
      { agora: () => new Date('2026-10-19T03:30:00Z') } as ClockService,
      metricas,
    );
  });
  afterEach(() => jest.useRealTimers());

  describe('Cenário: gravação bem-sucedida', () => {
    it('Então faz o upsert com a data e a hora locais da filial e conta a métrica', async () => {
      sequelize.query.mockResolvedValue([undefined, 1]);
      await service.registrar(ACESSO);
      const [sql, opcoes] = sequelize.query.mock.calls[0];
      expect(sql).toContain('ON CONFLICT (filial_id, data, hora)');
      expect(sql).toContain('quantidade = acessos_filial.quantidade + 1');
      expect(opcoes.replacements).toEqual({ tenantId: 't1', filialId: 'f1', data: '2026-10-18', hora: 23 });
      expect(opcoes.transaction).toBeUndefined();
      expect(metricas.contarAcessoRegistrado).toHaveBeenCalledTimes(1);
      expect(metricas.contarFalhaRegistroAcesso).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: erro do banco', () => {
    it('Então não rejeita e conta a falha com motivo "erro"', async () => {
      sequelize.query.mockRejectedValue(new Error('conexão recusada'));
      await expect(service.registrar(ACESSO)).resolves.toBeUndefined();
      expect(metricas.contarFalhaRegistroAcesso).toHaveBeenCalledWith('erro');
      expect(metricas.contarAcessoRegistrado).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: erro síncrono antes da query (fuso inválido)', () => {
    it('Então não rejeita e conta a falha com motivo "erro"', async () => {
      await expect(service.registrar({ ...ACESSO, fuso: 'Nada/Existe' })).resolves.toBeUndefined();
      expect(sequelize.query).not.toHaveBeenCalled();
      expect(metricas.contarFalhaRegistroAcesso).toHaveBeenCalledWith('erro');
    });
  });

  describe('Cenário: banco mais lento que o limite', () => {
    it('Então resolve no limite, conta "timeout" e ignora o erro tardio', async () => {
      jest.useFakeTimers();
      let rejeitar!: (e: Error) => void;
      sequelize.query.mockReturnValue(new Promise((_r, rej) => (rejeitar = rej)));
      const pendente = service.registrar(ACESSO);
      await jest.advanceTimersByTimeAsync(REGISTRO_ACESSO_TIMEOUT_MS - 1);
      expect(metricas.contarFalhaRegistroAcesso).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      await expect(pendente).resolves.toBeUndefined();
      expect(metricas.contarFalhaRegistroAcesso).toHaveBeenCalledWith('timeout');
      rejeitar(new Error('tarde demais'));
      await Promise.resolve();
      expect(metricas.contarFalhaRegistroAcesso).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('Cenário: sucesso antes do limite', () => {
    it('Então limpa o timer', async () => {
      jest.useFakeTimers();
      sequelize.query.mockResolvedValue([undefined, 1]);
      await service.registrar(ACESSO);
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
