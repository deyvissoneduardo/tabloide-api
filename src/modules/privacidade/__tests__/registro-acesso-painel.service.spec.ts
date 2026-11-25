import { Logger } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { validate as ehUuid, version as versaoUuid } from 'uuid';
import type { ClockService } from '../../../common/clock/clock.service';
import { RegistroAcessoPainelService, ROTA_MAX } from '../services/registro-acesso-painel.service';

const AGORA = new Date('2026-11-25T12:00:00Z');

describe('Funcionalidade: Registro de acesso ao painel (Marco Civil art. 15)', () => {
  const query = jest.fn();
  const service = new RegistroAcessoPainelService(
    { query } as unknown as Sequelize,
    { agora: () => AGORA } as ClockService,
  );

  beforeEach(() => {
    query.mockReset().mockResolvedValue(undefined);
  });

  it('Cenário: Dado um acesso, então grava tenant, IP, método, rota sem query string e horário', async () => {
    await service.registrar({
      tenantId: 't1',
      ip: '203.0.113.7',
      metodo: 'GET',
      url: '/v1/filiais?pagina=2',
    });
    const [sql, opcoes] = query.mock.calls[0];
    expect(sql).toContain('INSERT INTO registros_acesso_painel');
    expect(opcoes.type).toBe(QueryTypes.INSERT);
    expect(opcoes.replacements).toMatchObject({
      tenantId: 't1',
      ip: '203.0.113.7',
      metodo: 'GET',
      rota: '/v1/filiais',
      ocorridoEm: AGORA,
    });
    expect(ehUuid(opcoes.replacements.id) && versaoUuid(opcoes.replacements.id)).toBe(7);
  });

  it('Cenário: Dado IP ausente e rota longa, então IP null e rota truncada', async () => {
    await service.registrar({ tenantId: 't1', ip: undefined, metodo: 'GET', url: `/${'a'.repeat(900)}` });
    const { replacements } = query.mock.calls[0][1];
    expect(replacements.ip).toBeNull();
    expect(replacements.rota).toHaveLength(ROTA_MAX);
  });

  it('Cenário: Dado falha no banco, então não rejeita e registra log de erro', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    query.mockRejectedValue(new Error('conexão caiu'));
    await expect(
      service.registrar({ tenantId: 't1', ip: '::1', metodo: 'GET', url: '/v1/x' }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith({ evento: 'acesso_painel.registro_falhou', erro: 'conexão caiu' });
    log.mockRestore();
  });
});
