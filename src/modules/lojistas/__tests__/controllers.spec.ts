import { HttpStatus, RequestMethod } from '@nestjs/common';
import { HTTP_CODE_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { AdminLojistasController } from '../../admin/controllers/admin-lojistas.controller';
import { AuthController } from '../../auth/controllers/auth.controller';
import type { AuthService } from '../../auth/services/auth.service';
import { PainelLojistaController } from '../controllers/painel-lojista.controller';
import { StatusLojista } from '../models/status-lojista';
import type { LojistasService } from '../services/lojistas.service';

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
  };

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
    const auth = {
      cadastrar: jest.fn().mockResolvedValue('sessao-c'),
      login: jest.fn().mockResolvedValue('sessao-l'),
    };
    const controller = new AuthController(auth as unknown as AuthService);

    it('Então cadastro chama AuthService.cadastrar e responde 201 (padrão do POST)', async () => {
      await expect(controller.cadastrar({} as never)).resolves.toBe('sessao-c');
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, AuthController.prototype.cadastrar)).toBeUndefined();
    });

    it('E login chama AuthService.login e responde 200', async () => {
      await expect(controller.login({ email: 'a@x.com', senha: 'x' })).resolves.toBe('sessao-l');
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, AuthController.prototype.login)).toBe(HttpStatus.OK);
    });
  });

  describe('Cenário: PATCH /admin/lojistas/:id/senha', () => {
    it('Então chama redefinirSenha(id, novaSenha) e responde 204', async () => {
      const controller = new AdminLojistasController(lojistas as unknown as LojistasService);
      await controller.redefinirSenha('id-1', { novaSenha: 'novaSenha123' });
      expect(lojistas.redefinirSenha).toHaveBeenCalledWith('id-1', 'novaSenha123');
      const metodo = AdminLojistasController.prototype.redefinirSenha;
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, metodo)).toBe(HttpStatus.NO_CONTENT);
      expect(Reflect.getMetadata(METHOD_METADATA, metodo)).toBe(RequestMethod.PATCH);
    });
  });
});
