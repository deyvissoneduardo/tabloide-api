import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { UniqueConstraintError } from 'sequelize';
import { validate as ehUuid, version as versaoUuid } from 'uuid';
import { LojistasService } from '../services/lojistas.service';
import { SenhaService } from '../services/senha.service';
import { Lojista } from '../models/lojista.model';
import { LojistaAtivacao } from '../models/lojista-ativacao.model';
import { StatusLojista } from '../models/status-lojista';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { umCadastroDeLojista } from '../../../../test/factories/lojista.factory';

describe('Funcionalidade: Cadastro do lojista (RN01, RN02, RN37)', () => {
  let service: LojistasService;
  const transacao = { id: 'tx' };
  const lojistaModel = { findOne: jest.fn(), create: jest.fn() };
  const ativacaoModel = { create: jest.fn() };
  const sequelize = { transaction: jest.fn((cb: (t: unknown) => unknown) => cb(transacao)) };
  const senhaService = { gerarHash: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    senhaService.gerarHash.mockResolvedValue('$argon2id$hash');
    lojistaModel.findOne.mockResolvedValue(null);
    lojistaModel.create.mockImplementation(async (dados) => ({ ...dados }));
    ativacaoModel.create.mockImplementation(async (dados) => ({ ...dados }));
    const modulo = await Test.createTestingModule({
      providers: [
        LojistasService,
        { provide: getModelToken(Lojista), useValue: lojistaModel },
        { provide: getModelToken(LojistaAtivacao), useValue: ativacaoModel },
        { provide: Sequelize, useValue: sequelize },
        { provide: SenhaService, useValue: senhaService },
      ],
    }).compile();
    service = modulo.get(LojistasService);
  });

  describe('Cenário: cadastro com sucesso sem CNPJ', () => {
    describe('Dado que o e-mail "ana@bompreco.com.br" não existe', () => {
      describe('Quando cadastrar é chamado com dados válidos e cnpj null', () => {
        const dto = umCadastroDeLojista().comEmail('ana@bompreco.com.br').semCnpj().build();

        it('Então lojistaModel.create recebe id UUID v7, campos normalizados e senhaHash', async () => {
          await service.cadastrar(dto);
          const [dados] = lojistaModel.create.mock.calls[0];
          expect(ehUuid(dados.id) && versaoUuid(dados.id)).toBe(7);
          expect(dados).toMatchObject({
            email: 'ana@bompreco.com.br',
            senhaHash: '$argon2id$hash',
            cnpj: null,
            whatsapp: '+5511987654321',
          });
          expect(dados).not.toHaveProperty('senha');
        });

        it('E a ativação nasce AGUARDANDO_ATIVACAO na mesma transação', async () => {
          await service.cadastrar(dto);
          const [dadosLojista, opcoesLojista] = lojistaModel.create.mock.calls[0];
          const [dadosAtivacao, opcoesAtivacao] = ativacaoModel.create.mock.calls[0];
          expect(dadosAtivacao).toEqual({
            lojistaId: dadosLojista.id,
            status: StatusLojista.AGUARDANDO_ATIVACAO,
          });
          expect(opcoesLojista.transaction).toBe(transacao);
          expect(opcoesAtivacao.transaction).toBe(transacao);
        });

        it('E o retorno tem status AGUARDANDO_ATIVACAO', async () => {
          await expect(service.cadastrar(dto)).resolves.toMatchObject({
            status: StatusLojista.AGUARDANDO_ATIVACAO,
          });
        });

        it('E o hash é gerado antes de abrir a transação', async () => {
          await service.cadastrar(dto);
          expect(senhaService.gerarHash.mock.invocationCallOrder[0]).toBeLessThan(
            sequelize.transaction.mock.invocationCallOrder[0]!,
          );
        });

        it('E a busca de existência traz só o id', async () => {
          await service.cadastrar(dto);
          expect(lojistaModel.findOne).toHaveBeenCalledWith({
            where: { email: 'ana@bompreco.com.br' },
            attributes: ['id'],
          });
        });
      });
    });
  });

  describe('Cenário: cadastro com CNPJ', () => {
    it('Então lojistaModel.create recebe o CNPJ', async () => {
      await service.cadastrar(umCadastroDeLojista().comCnpj('11222333000181').build());
      expect(lojistaModel.create.mock.calls[0][0].cnpj).toBe('11222333000181');
    });
  });

  describe('Cenário: cadastro sem a propriedade cnpj', () => {
    it('Então grava cnpj null', async () => {
      const { cnpj: _, ...semCnpj } = umCadastroDeLojista().build();
      await service.cadastrar(semCnpj);
      expect(lojistaModel.create.mock.calls[0][0].cnpj).toBeNull();
    });
  });

  describe('Cenário: e-mail já cadastrado', () => {
    describe('Dado que findOne por e-mail devolve um lojista', () => {
      beforeEach(() => lojistaModel.findOne.mockResolvedValue({ id: 'existente' }));

      it('Então lança EMAIL_JA_CADASTRADO', () =>
        expect(service.cadastrar(umCadastroDeLojista().build())).rejects.toMatchObject({
          codigo: CodigoErro.EMAIL_JA_CADASTRADO,
        }));

      it('E não gera hash nem abre transação', async () => {
        await service.cadastrar(umCadastroDeLojista().build()).catch(() => undefined);
        expect(senhaService.gerarHash).not.toHaveBeenCalled();
        expect(sequelize.transaction).not.toHaveBeenCalled();
      });
    });
  });

  describe('Cenário: falha ao criar a ativação desfaz o cadastro', () => {
    it('Então o erro é propagado pela transação', async () => {
      ativacaoModel.create.mockRejectedValue(new Error('falhou'));
      await expect(service.cadastrar(umCadastroDeLojista().build())).rejects.toThrow('falhou');
      await expect(sequelize.transaction.mock.results[0]!.value).rejects.toThrow('falhou');
    });
  });

  describe('Cenário: corrida de e-mail no banco', () => {
    it('Então o UniqueConstraintError é propagado sem tratamento', async () => {
      const erro = new UniqueConstraintError({});
      lojistaModel.create.mockRejectedValue(erro);
      await expect(service.cadastrar(umCadastroDeLojista().build())).rejects.toBe(erro);
    });
  });
});
