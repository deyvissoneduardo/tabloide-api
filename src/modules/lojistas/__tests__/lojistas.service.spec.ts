import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { LojistaAtivacao } from '../models/lojista-ativacao.model';
import { Lojista } from '../models/lojista.model';
import { StatusLojista } from '../models/status-lojista';
import { LojistasService } from '../services/lojistas.service';
import { SenhaService } from '../services/senha.service';

/** Instância falsa com a mesma semântica de set/changed/save do Sequelize. */
function umLojistaModel(dados: Record<string, unknown>, status: StatusLojista | null = StatusLojista.ATIVO) {
  const alterados = new Set<string>();
  const instancia: Record<string, unknown> = {
    ...dados,
    ativacao: status ? { status } : undefined,
    set: jest.fn((campo: string, valor: unknown) => {
      if (instancia[campo] !== valor) alterados.add(campo);
      instancia[campo] = valor;
    }),
    changed: jest.fn(() => (alterados.size ? [...alterados] : false)),
    save: jest.fn(async () => instancia),
  };
  return instancia;
}

describe('Funcionalidade: LojistasService', () => {
  let service: LojistasService;
  const escopoComSenha = { findOne: jest.fn() };
  const lojistaModel = { findOne: jest.fn(), update: jest.fn(), scope: jest.fn(() => escopoComSenha) };
  const ativacaoModel = { findOne: jest.fn() };
  const senhaService = { gerarHash: jest.fn().mockResolvedValue('$argon2id$novo') };

  beforeEach(async () => {
    jest.clearAllMocks();
    const modulo = await Test.createTestingModule({
      providers: [
        LojistasService,
        { provide: getModelToken(Lojista), useValue: lojistaModel },
        { provide: getModelToken(LojistaAtivacao), useValue: ativacaoModel },
        { provide: Sequelize, useValue: {} },
        { provide: SenhaService, useValue: senhaService },
      ],
    }).compile();
    service = modulo.get(LojistasService);
  });

  describe('Funcionalidade: Consulta e edição dos dados do lojista', () => {
    describe('Cenário: obter por tenant', () => {
      it('Então devolve o lojista e o status, buscando por id com include da ativação', async () => {
        const lojista = umLojistaModel({ id: 't1' });
        lojistaModel.findOne.mockResolvedValue(lojista);
        await expect(service.obterPorTenant('t1')).resolves.toEqual({ lojista, status: StatusLojista.ATIVO });
        expect(lojistaModel.findOne).toHaveBeenCalledWith({
          where: { id: 't1' },
          include: [{ model: LojistaAtivacao, attributes: ['status'] }],
        });
      });
    });

    describe('Cenário: obter tenant inexistente', () => {
      it('Então lança RECURSO_NAO_ENCONTRADO', () => {
        lojistaModel.findOne.mockResolvedValue(null);
        return expect(service.obterPorTenant('t1')).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
      });
    });

    describe('Cenário: lojista sem linha de ativação', () => {
      it('Então lança RECURSO_NAO_ENCONTRADO', () => {
        lojistaModel.findOne.mockResolvedValue(umLojistaModel({ id: 't1' }, null));
        return expect(service.obterPorTenant('t1')).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
      });
    });

    describe('Cenário: editar só nome fantasia', () => {
      it('Então só nomeFantasia muda e save é chamado uma vez', async () => {
        const lojista = umLojistaModel({ id: 't1', nomeFantasia: 'Antigo', whatsapp: '+5511987654321' });
        lojistaModel.findOne.mockResolvedValue(lojista);
        await service.editar('t1', { nomeFantasia: 'Novo' });
        expect(lojista.set).toHaveBeenCalledTimes(1);
        expect(lojista.set).toHaveBeenCalledWith('nomeFantasia', 'Novo');
        expect(lojista.save).toHaveBeenCalledTimes(1);
      });
    });

    describe('Cenário: remover CNPJ', () => {
      it('Então cnpj fica null', async () => {
        const lojista = umLojistaModel({ id: 't1', cnpj: '11222333000181' });
        lojistaModel.findOne.mockResolvedValue(lojista);
        const { lojista: editado } = await service.editar('t1', { cnpj: null });
        expect(editado.cnpj).toBeNull();
        expect(lojista.save).toHaveBeenCalled();
      });
    });

    describe('Cenário: edição sem mudança real', () => {
      it('Então save não é chamado', async () => {
        const lojista = umLojistaModel({ id: 't1', nomeFantasia: 'Mercado' });
        lojistaModel.findOne.mockResolvedValue(lojista);
        await expect(service.editar('t1', { nomeFantasia: 'Mercado' })).resolves.toMatchObject({ lojista });
        expect(lojista.save).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: editar tenant inexistente', () => {
      it('Então lança RECURSO_NAO_ENCONTRADO', () => {
        lojistaModel.findOne.mockResolvedValue(null);
        return expect(service.editar('t1', { nomeFantasia: 'x' })).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
      });
    });
  });

  describe('Funcionalidade: Busca para login', () => {
    describe('Cenário: e-mail existente', () => {
      it('Então usa o escopo comSenha e devolve lojista com status', async () => {
        const lojista = umLojistaModel({ id: 't1', senhaHash: 'h' }, StatusLojista.DESATIVADO);
        escopoComSenha.findOne.mockResolvedValue(lojista);
        await expect(service.buscarParaLogin('a@x.com')).resolves.toEqual({
          lojista,
          status: StatusLojista.DESATIVADO,
        });
        expect(lojistaModel.scope).toHaveBeenCalledWith('comSenha');
        expect(escopoComSenha.findOne).toHaveBeenCalledWith(
          expect.objectContaining({ where: { email: 'a@x.com' } }),
        );
      });
    });

    describe('Cenário: e-mail inexistente', () => {
      it('Então devolve null', () => {
        escopoComSenha.findOne.mockResolvedValue(null);
        return expect(service.buscarParaLogin('a@x.com')).resolves.toBeNull();
      });
    });
  });

  describe('Funcionalidade: Redefinição de senha pelo administrador (RN36)', () => {
    describe('Cenário: redefinir com sucesso', () => {
      it('Então update recebe o novo hash e o log não contém a senha', async () => {
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        lojistaModel.update.mockResolvedValue([1]);
        await service.redefinirSenha('id-1', 'novaSenha123');
        expect(senhaService.gerarHash).toHaveBeenCalledWith('novaSenha123');
        expect(lojistaModel.update).toHaveBeenCalledWith(
          { senhaHash: '$argon2id$novo' },
          { where: { id: 'id-1' } },
        );
        expect(log).toHaveBeenCalledWith({ evento: 'admin.senha_redefinida', lojistaId: 'id-1' });
        expect(JSON.stringify(log.mock.calls)).not.toContain('novaSenha123');
        log.mockRestore();
      });
    });

    describe('Cenário: lojista inexistente', () => {
      it('Então lança RECURSO_NAO_ENCONTRADO', () => {
        lojistaModel.update.mockResolvedValue([0]);
        return expect(service.redefinirSenha('id-1', 'novaSenha123')).rejects.toMatchObject({
          codigo: CodigoErro.RECURSO_NAO_ENCONTRADO,
        });
      });
    });
  });

  describe('Funcionalidade: Status do lojista', () => {
    describe('Cenário: status existente', () => {
      it('Então devolve o status consultando só a coluna status', async () => {
        ativacaoModel.findOne.mockResolvedValue({ status: StatusLojista.DESATIVADO });
        await expect(service.obterStatus('t1')).resolves.toBe(StatusLojista.DESATIVADO);
        expect(ativacaoModel.findOne).toHaveBeenCalledWith({
          where: { lojistaId: 't1' },
          attributes: ['status'],
        });
      });
    });

    describe('Cenário: sem ativação', () => {
      it('Então devolve null', () => {
        ativacaoModel.findOne.mockResolvedValue(null);
        return expect(service.obterStatus('t1')).resolves.toBeNull();
      });
    });
  });
});
