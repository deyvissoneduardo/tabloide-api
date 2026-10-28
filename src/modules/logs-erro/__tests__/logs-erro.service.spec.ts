import { validate as ehUuid } from 'uuid';
import type { ClockService } from '../../../common/clock/clock.service';
import type { LogErro } from '../models/log-erro.model';
import { LogsErroService, MAX_MENSAGEM, MAX_ROTA, MAX_STACK } from '../services/logs-erro.service';

const AGORA = new Date('2026-10-28T12:00:00Z');

describe('Funcionalidade: Registro de erros inesperados em logs_erro', () => {
  const model = { create: jest.fn() };
  let service: LogsErroService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new LogsErroService(model as unknown as typeof LogErro, { agora: () => AGORA } as ClockService);
  });

  const linha = () => model.create.mock.calls[0][0] as Record<string, unknown>;

  it('Cenário: Error → grava tipo, mensagem, stack e contexto, sem a query string', async () => {
    const erro = new TypeError('quebrou');
    await service.registrar(erro, { requestId: 'req-1', metodo: 'POST', url: '/v1/painel/x?email=a@b.c' });

    expect(linha()).toEqual({
      id: expect.any(String),
      ocorridoEm: AGORA,
      requestId: 'req-1',
      metodo: 'POST',
      rota: '/v1/painel/x',
      tipo: 'TypeError',
      mensagem: 'quebrou',
      stack: erro.stack,
    });
    expect(ehUuid(linha().id as string)).toBe(true);
    expect(model.create.mock.calls[0][1]).toEqual({ returning: false });
  });

  it('Cenário: valor que não é Error → mensagem em texto, sem stack nem contexto', async () => {
    await service.registrar('falhou', {});
    expect(linha()).toMatchObject({
      requestId: null,
      metodo: null,
      rota: null,
      tipo: 'string',
      mensagem: 'falhou',
      stack: null,
    });
  });

  it('Cenário: textos longos são cortados no limite das colunas', async () => {
    const erro = new Error('m'.repeat(MAX_MENSAGEM + 10));
    erro.stack = 's'.repeat(MAX_STACK + 10);
    await service.registrar(erro, { requestId: 'r'.repeat(70), url: `/${'a'.repeat(MAX_ROTA + 10)}` });

    expect((linha().mensagem as string).length).toBe(MAX_MENSAGEM);
    expect((linha().stack as string).length).toBe(MAX_STACK);
    expect((linha().rota as string).length).toBe(MAX_ROTA);
    expect((linha().requestId as string).length).toBe(64);
  });

  it('Cenário: Error sem mensagem grava mensagem vazia', async () => {
    await service.registrar(new Error(), {});
    expect(linha().mensagem).toBe('');
  });
});
