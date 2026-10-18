import { Logger, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { ArgumentsHost } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { UniqueConstraintError } from 'sequelize';
import { AppExceptionFilter } from '../app-exception.filter';
import { AppError } from '../app.error';
import { CodigoErro, MENSAGEM_POR_CODIGO, STATUS_POR_CODIGO } from '../codigos-erro';
import { CONSTRAINT_PARA_CODIGO, traduzirErroPg } from '../pg-erros';
import { errosDeValidacaoParaAppError } from '../validacao';

const erroPg = (code: string, constraint?: string) => ({ parent: { code, constraint } });

function hostFalso(reqId = 'req-1') {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
    getHeaderNames: jest.fn(() => ['retry-after-login']),
    getHeader: jest.fn(() => 900),
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => ({ id: reqId }), getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('Funcionalidade: Contrato de erros', () => {
  describe('Cenário: AppError com mensagem padrão', () => {
    it('Então usa o texto padrão e o status 409', () => {
      const erro = new AppError(CodigoErro.EMAIL_JA_CADASTRADO);
      expect(erro.message).toBe(MENSAGEM_POR_CODIGO[CodigoErro.EMAIL_JA_CADASTRADO]);
      expect(erro.status).toBe(409);
    });
  });

  describe('Cenário: todo código tem status e mensagem', () => {
    it.each(Object.values(CodigoErro))('Então %s tem entrada nos dois mapas', (codigo) => {
      expect(STATUS_POR_CODIGO[codigo]).toEqual(expect.any(Number));
      expect(MENSAGEM_POR_CODIGO[codigo]).toEqual(expect.any(String));
    });
  });

  describe('Funcionalidade: traduzirErroPg', () => {
    it('Cenário: unique de e-mail → EMAIL_JA_CADASTRADO', () =>
      expect(traduzirErroPg(erroPg('23505', 'lojistas_email_key'))?.codigo).toBe(
        CodigoErro.EMAIL_JA_CADASTRADO,
      ));

    it('Cenário: unique sem mapeamento → VALIDACAO_INVALIDA', () =>
      expect(traduzirErroPg(erroPg('23505', 'outra_key'))?.codigo).toBe(CodigoErro.VALIDACAO_INVALIDA));

    it('Cenário: exclusion de panfleto → PANFLETO_PERIODO_SOBREPOSTO', () =>
      expect(traduzirErroPg(erroPg('23P01', 'panfletos_periodo_sem_sobreposicao'))?.codigo).toBe(
        CodigoErro.PANFLETO_PERIODO_SOBREPOSTO,
      ));

    it('Cenário: exclusion sem mapeamento → VALIDACAO_INVALIDA', () =>
      expect(traduzirErroPg(erroPg('23P01', 'outra_excl'))?.codigo).toBe(CodigoErro.VALIDACAO_INVALIDA));

    it('Cenário: check mapeado → código registrado', () => {
      CONSTRAINT_PARA_CODIGO.teste_check = CodigoErro.PRECO_ORIGINAL_INVALIDO;
      expect(traduzirErroPg(erroPg('23514', 'teste_check'))?.codigo).toBe(CodigoErro.PRECO_ORIGINAL_INVALIDO);
      delete CONSTRAINT_PARA_CODIGO.teste_check;
    });

    it('Cenário: check não mapeado → VALIDACAO_INVALIDA', () =>
      expect(traduzirErroPg(erroPg('23514', 'desconhecida_check'))?.codigo).toBe(
        CodigoErro.VALIDACAO_INVALIDA,
      ));

    it('Cenário: chave estrangeira → RECURSO_NAO_ENCONTRADO', () =>
      expect(traduzirErroPg(erroPg('23503'))?.codigo).toBe(CodigoErro.RECURSO_NAO_ENCONTRADO));

    it('Cenário: erro em "original" em vez de "parent"', () =>
      expect(traduzirErroPg({ original: { code: '23503' } })?.codigo).toBe(
        CodigoErro.RECURSO_NAO_ENCONTRADO,
      ));

    it('Cenário: erro PG desconhecido → null', () => expect(traduzirErroPg(erroPg('42P01'))).toBeNull());

    it.each([null, 'texto', new Error('x'), {}])('Cenário: valor que não é erro do PG (%p) → null', (v) =>
      expect(traduzirErroPg(v)).toBeNull(),
    );
  });

  describe('Cenário: erros de validação aninhados', () => {
    it('Então achata com notação de ponto', () => {
      const erros = [
        { property: 'email', constraints: { a: 'm1', b: 'm2' }, children: [] },
        { property: 'endereco', children: [{ property: 'cep', constraints: { c: 'm3' }, children: [] }] },
      ] as unknown as ValidationError[];
      const erro = errosDeValidacaoParaAppError(erros);
      expect(erro.codigo).toBe(CodigoErro.VALIDACAO_INVALIDA);
      expect(erro.detalhes).toEqual({ campos: { email: ['m1', 'm2'], 'endereco.cep': ['m3'] } });
    });
  });

  describe('Funcionalidade: AppExceptionFilter', () => {
    const filtro = new AppExceptionFilter();

    it('Cenário: AppError → status e corpo padrão, com x-request-id', () => {
      const { host, res } = hostFalso('abc');
      filtro.catch(new AppError(CodigoErro.LOJISTA_DESATIVADO), host);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        erro: { codigo: 'LOJISTA_DESATIVADO', mensagem: MENSAGEM_POR_CODIGO[CodigoErro.LOJISTA_DESATIVADO] },
      });
      expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'abc');
    });

    it('Cenário: AppError com detalhes inclui detalhes no corpo', () => {
      const { host, res } = hostFalso();
      filtro.catch(new AppError(CodigoErro.VALIDACAO_INVALIDA, undefined, { campos: {} }), host);
      expect(res.json.mock.calls[0][0].erro.detalhes).toEqual({ campos: {} });
    });

    it('Cenário: 404 de rota do Nest → RECURSO_NAO_ENCONTRADO', () => {
      const { host, res } = hostFalso();
      filtro.catch(new NotFoundException(), host);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json.mock.calls[0][0].erro.codigo).toBe('RECURSO_NAO_ENCONTRADO');
    });

    it('Cenário: ThrottlerException → 429 MUITAS_TENTATIVAS', () => {
      const { host, res } = hostFalso();
      filtro.catch(new ThrottlerException(), host);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json.mock.calls[0][0].erro.codigo).toBe('MUITAS_TENTATIVAS');
    });

    it('Cenário: 429 copia Retry-After-<nome> para Retry-After', () => {
      const { host, res } = hostFalso();
      filtro.catch(new ThrottlerException(), host);
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '900');
    });

    it('Cenário: 429 sem header nomeado não define Retry-After', () => {
      const { host, res } = hostFalso();
      res.getHeaderNames.mockReturnValue([]);
      filtro.catch(new ThrottlerException(), host);
      expect(res.setHeader).not.toHaveBeenCalledWith('Retry-After', expect.anything());
    });

    it('Cenário: erro de constraint do Sequelize → 409 EMAIL_JA_CADASTRADO', () => {
      const { host, res } = hostFalso();
      const erro = new UniqueConstraintError({
        parent: { code: '23505', constraint: 'lojistas_email_key' } as never,
      });
      filtro.catch(erro, host);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json.mock.calls[0][0].erro.codigo).toBe('EMAIL_JA_CADASTRADO');
    });

    it('Cenário: erro inesperado → 500 sem vazar mensagem nem stack, com log de nível error', () => {
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { host, res } = hostFalso();
      filtro.catch(new Error('falha secreta com stack'), host);
      expect(res.status).toHaveBeenCalledWith(500);
      const corpo = JSON.stringify(res.json.mock.calls[0][0]);
      expect(corpo).not.toContain('falha secreta');
      expect(corpo).not.toContain('at ');
      expect(log).toHaveBeenCalledWith('Erro inesperado', expect.stringContaining('falha secreta'));
      log.mockRestore();
    });
  });
});
