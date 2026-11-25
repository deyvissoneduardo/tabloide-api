import { HttpStatus, RequestMethod } from '@nestjs/common';
import { HTTP_CODE_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { AdminLojistasController } from '../../admin/controllers/admin-lojistas.controller';
import { AuthController } from '../../auth/controllers/auth.controller';
import type { AuthService } from '../../auth/services/auth.service';
import { PainelLojistaController } from '../controllers/painel-lojista.controller';
import { StatusLojista } from '../models/status-lojista';
import type { ExportacaoDadosService } from '../../privacidade/services/exportacao-dados.service';
import type { RegistroAcessoPainelService } from '../../privacidade/services/registro-acesso-painel.service';
import type { LojistasService } from '../services/lojistas.service';
import type { StatusLojistaCache } from '../services/status-lojista.cache';

const lojista = {
  id: 't1',
  nomeFantasia: 'Mercado',
  nomeResponsavel: 'Ana',
  email: 'ana@x.com',
  whatsapp: '+5511987654321',
  cnpj: null,
  createdAt: new Date('2026-10-18T15:00:00Z'),
};

describe('Funcionalidade: Mapeamento dos controllers', () => {
  const lojistas = {
    obterPorTenant: jest.fn().mockResolvedValue({ lojista, status: StatusLojista.ATIVO }),
    editar: jest.fn().mockResolvedValue({ lojista, status: StatusLojista.ATIVO }),
    redefinirSenha: jest.fn().mockResolvedValue(undefined),
    encerrar: jest.fn().mockResolvedValue(undefined),
  };
  const statusCache = { invalidar: jest.fn() };
  const exportacao = { exportar: jest.fn().mockResolvedValue({ lojista: { id: 'id-1' } }) };
  const novoAdmin = () =>
    new AdminLojistasController(
      lojistas as unknown as LojistasService,
      statusCache as unknown as StatusLojistaCache,
      exportacao as unknown as ExportacaoDadosService,
    );

  describe('Cenário: GET /painel/lojista', () => {
    it('Então chama obterPorTenant e devolve a view', async () => {
      const controller = new PainelLojistaController(lojistas as unknown as LojistasService);
      await expect(controller.obter('t1')).resolves.toMatchObject({ id: 't1', status: StatusLojista.ATIVO });
      expect(lojistas.obterPorTenant).toHaveBeenCalledWith('t1');
    });
  });

  describe('Cenário: PATCH /painel/lojista', () => {
    it('Então chama editar(tenant, dto) e devolve a view', async () => {
      const controller = new PainelLojistaController(lojistas as unknown as LojistasService);
      const dto = { nomeFantasia: 'Novo' };
      await expect(controller.editar('t1', dto)).resolves.toMatchObject({ id: 't1' });
      expect(lojistas.editar).toHaveBeenCalledWith('t1', dto);
    });
  });

  describe('Cenário: POST /auth/cadastro e /auth/login', () => {
    const sessaoC = { lojista: { id: 't-c' } };
    const sessaoL = { lojista: { id: 't-l' } };
    const auth = {
      cadastrar: jest.fn().mockResolvedValue(sessaoC),
      login: jest.fn().mockResolvedValue(sessaoL),
    };
    const registro = { registrar: jest.fn().mockResolvedValue(undefined) };
    const controller = new AuthController(
      auth as unknown as AuthService,
      registro as unknown as RegistroAcessoPainelService,
    );
    const req = { ip: '203.0.113.7', method: 'POST', originalUrl: '/v1/auth/cadastro' } as never;

    it('Então cadastro chama AuthService.cadastrar e responde 201 (padrão do POST)', async () => {
      await expect(controller.cadastrar({} as never, req)).resolves.toBe(sessaoC);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, AuthController.prototype.cadastrar)).toBeUndefined();
    });

    it('E login chama AuthService.login e responde 200', async () => {
      await expect(controller.login({ email: 'a@x.com', senha: 'x' }, req)).resolves.toBe(sessaoL);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, AuthController.prototype.login)).toBe(HttpStatus.OK);
    });

    it('E registra o acesso com o tenant da sessão emitida, nunca do corpo (Marco Civil art. 15)', async () => {
      registro.registrar.mockClear();
      await controller.login({ email: 'a@x.com', senha: 'x' }, req);
      expect(registro.registrar).toHaveBeenCalledWith({
        tenantId: 't-l',
        ip: '203.0.113.7',
        metodo: 'POST',
        url: '/v1/auth/cadastro',
      });
    });
  });

  describe('Cenário: PATCH /admin/lojistas/:id/senha', () => {
    it('Então chama redefinirSenha(id, novaSenha) e responde 204', async () => {
      const controller = novoAdmin();
      await controller.redefinirSenha('id-1', { novaSenha: 'novaSenha123' });
      expect(lojistas.redefinirSenha).toHaveBeenCalledWith('id-1', 'novaSenha123');
      const metodo = AdminLojistasController.prototype.redefinirSenha;
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, metodo)).toBe(HttpStatus.NO_CONTENT);
      expect(Reflect.getMetadata(METHOD_METADATA, metodo)).toBe(RequestMethod.PATCH);
    });
  });

  describe('Cenário: PATCH /admin/lojistas/:id/encerramento (LGPD)', () => {
    it('Então encerra, invalida o cache de status e responde 204', async () => {
      await novoAdmin().encerrar('id-1');
      expect(lojistas.encerrar).toHaveBeenCalledWith('id-1');
      expect(statusCache.invalidar).toHaveBeenCalledWith('id-1');
      const metodo = AdminLojistasController.prototype.encerrar;
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, metodo)).toBe(HttpStatus.NO_CONTENT);
      expect(Reflect.getMetadata(METHOD_METADATA, metodo)).toBe(RequestMethod.PATCH);
    });
  });

  describe('Cenário: GET /admin/lojistas/:id/dados (LGPD art. 18)', () => {
    it('Então devolve a exportação do lojista', async () => {
      await expect(novoAdmin().exportarDados('id-1')).resolves.toEqual({ lojista: { id: 'id-1' } });
      expect(exportacao.exportar).toHaveBeenCalledWith('id-1');
      expect(Reflect.getMetadata(METHOD_METADATA, AdminLojistasController.prototype.exportarDados)).toBe(
        RequestMethod.GET,
      );
    });
  });
});
