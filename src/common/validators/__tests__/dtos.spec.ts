import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RedefinirSenhaDto } from '../../../modules/admin/dtos/redefinir-senha.dto';
import { LoginDto } from '../../../modules/auth/dtos/login.dto';
import { CadastrarLojistaDto } from '../../../modules/lojistas/dtos/cadastrar-lojista.dto';
import { EditarLojistaDto } from '../../../modules/lojistas/dtos/editar-lojista.dto';
import { CodigoErro } from '../../errors/codigos-erro';
import { errosDeValidacaoParaAppError } from '../../errors/validacao';

type Classe<T> = new () => T;

async function validar<T extends object>(classe: Classe<T>, corpo: object) {
  const instancia = plainToInstance(classe, corpo);
  const erros = await validate(instancia, { whitelist: true, forbidNonWhitelisted: true });
  const campos = Object.fromEntries(erros.map((e) => [e.property, Object.values(e.constraints ?? {})]));
  return { instancia, campos };
}

const cadastroValido = () => ({
  nomeFantasia: 'Mercado Bom Preço',
  nomeResponsavel: 'Ana Souza',
  email: 'ana@bompreco.com.br',
  senha: 'senhaForte1',
  whatsapp: '(11) 98765-4321',
});

describe('Funcionalidade: Validação do cadastro (RN01)', () => {
  describe('Cenário: corpo válido mínimo', () => {
    it('Então não há erros e cnpj fica undefined', async () => {
      const { instancia, campos } = await validar(CadastrarLojistaDto, cadastroValido());
      expect(campos).toEqual({});
      expect(instancia.cnpj).toBeUndefined();
    });
  });

  describe('Cenário: normalizações', () => {
    it('Então e-mail, WhatsApp, nome e CNPJ saem normalizados', async () => {
      const { instancia, campos } = await validar(CadastrarLojistaDto, {
        ...cadastroValido(),
        email: ' Ana@X.COM ',
        nomeFantasia: '  Bom   Preço ',
        cnpj: '11.222.333/0001-81',
      });
      expect(campos).toEqual({});
      expect(instancia).toMatchObject({
        email: 'ana@x.com',
        whatsapp: '+5511987654321',
        nomeFantasia: 'Bom Preço',
        cnpj: '11222333000181',
      });
    });
  });

  describe('Cenário: cnpj vazio', () => {
    it('Então cnpj é null e não há erro', async () => {
      const { instancia, campos } = await validar(CadastrarLojistaDto, { ...cadastroValido(), cnpj: '  ' });
      expect(campos).toEqual({});
      expect(instancia.cnpj).toBeNull();
    });
  });

  describe('Esquema do Cenário: campo obrigatório ausente', () => {
    it.each(['nomeFantasia', 'nomeResponsavel', 'email', 'senha', 'whatsapp'])(
      'Então há erro em %s',
      async (campo) => {
        const corpo: Record<string, unknown> = cadastroValido();
        delete corpo[campo];
        const { campos } = await validar(CadastrarLojistaDto, corpo);
        expect(campos[campo]).toBeDefined();
      },
    );
  });

  describe('Esquema do Cenário: senha inválida', () => {
    it.each([
      ['curta', 'abc1234'],
      ['só letras', 'somenteletra'],
      ['só números', '12345678'],
      ['129 caracteres', `a1${'x'.repeat(127)}`],
    ])('Então senha %s é recusada', async (_nome, senha) => {
      const { campos } = await validar(CadastrarLojistaDto, { ...cadastroValido(), senha });
      expect(campos.senha).toBeDefined();
    });

    it('Então senha que não é texto é recusada', async () => {
      const { campos } = await validar(CadastrarLojistaDto, { ...cadastroValido(), senha: 12345678 });
      expect(campos.senha).toBeDefined();
    });
  });

  describe('Cenário: senha não é aparada', () => {
    it('Então permanece com os espaços', async () => {
      const { instancia } = await validar(CadastrarLojistaDto, {
        ...cadastroValido(),
        senha: ' senhaForte1 ',
      });
      expect(instancia.senha).toBe(' senhaForte1 ');
    });
  });

  describe('Cenário: nome curto e longo demais', () => {
    it.each(['A', 'x'.repeat(121)])('Então "%s" é recusado', async (nomeFantasia) => {
      const { campos } = await validar(CadastrarLojistaDto, { ...cadastroValido(), nomeFantasia });
      expect(campos.nomeFantasia).toBeDefined();
    });
  });

  describe('Cenário: e-mail inválido', () => {
    it.each(['ana@', 'ana bompreco.com'])('Então "%s" é recusado', async (email) => {
      const { campos } = await validar(CadastrarLojistaDto, { ...cadastroValido(), email });
      expect(campos.email).toBeDefined();
    });
  });

  describe('Cenário: WhatsApp inválido', () => {
    it('Então há erro em whatsapp com mensagem em português', async () => {
      const { campos } = await validar(CadastrarLojistaDto, { ...cadastroValido(), whatsapp: '98765-4321' });
      expect(campos.whatsapp).toEqual(['Informe um WhatsApp válido com DDD.']);
    });
  });

  describe('Cenário: CNPJ inválido', () => {
    it.each(['11.222.333/0001-82', '11222333000182', 123])('Então "%s" é recusado', async (cnpj) => {
      const { campos } = await validar(CadastrarLojistaDto, { ...cadastroValido(), cnpj });
      expect(campos.cnpj).toBeDefined();
    });
  });
});

describe('Funcionalidade: Validação da edição do lojista', () => {
  describe('Cenário: corpo vazio', () => {
    it('Então há erro "Informe ao menos um campo."', async () => {
      const { campos } = await validar(EditarLojistaDto, {});
      expect(campos.corpo).toEqual(['Informe ao menos um campo.']);
    });
  });

  describe('Cenário: campo proibido', () => {
    it.each(['email', 'senha', 'status', 'corPrimaria', 'logoPath'])(
      'Então "%s" é recusado pelo ValidationPipe da app',
      async (campo) => {
        const pipe = new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          exceptionFactory: errosDeValidacaoParaAppError,
        });
        await expect(
          pipe.transform(
            { [campo]: 'x', nomeFantasia: 'Novo' },
            { type: 'body', metatype: EditarLojistaDto },
          ),
        ).rejects.toMatchObject({ codigo: CodigoErro.VALIDACAO_INVALIDA });
      },
    );
  });

  describe('Cenário: cnpj null explícito', () => {
    it('Então não há erros', async () => {
      const { campos, instancia } = await validar(EditarLojistaDto, { cnpj: null });
      expect(campos).toEqual({});
      expect(instancia.cnpj).toBeNull();
    });
  });

  describe('Cenário: edição parcial válida', () => {
    it('Então normaliza o WhatsApp', async () => {
      const { campos, instancia } = await validar(EditarLojistaDto, { whatsapp: '61 3333-4444' });
      expect(campos).toEqual({});
      expect(instancia.whatsapp).toBe('+556133334444');
    });
  });
});

describe('Funcionalidade: Validação do login e da redefinição de senha', () => {
  describe('Cenário: login sem senha', () => {
    it('Então há erro em senha', async () => {
      const { campos } = await validar(LoginDto, { email: 'a@x.com' });
      expect(campos.senha).toBeDefined();
    });
  });

  describe('Cenário: login com senha fraca é aceito no DTO', () => {
    it('Então não há erros (força só é exigida no cadastro)', async () => {
      const { campos, instancia } = await validar(LoginDto, { email: ' A@X.com', senha: '1' });
      expect(campos).toEqual({});
      expect(instancia.email).toBe('a@x.com');
    });
  });

  describe('Cenário: nova senha fraca', () => {
    it('Então há erro em novaSenha', async () => {
      const { campos } = await validar(RedefinirSenhaDto, { novaSenha: 'abc' });
      expect(campos.novaSenha).toBeDefined();
    });
  });

  describe('Cenário: nova senha forte', () => {
    it('Então não há erros', async () => {
      const { campos } = await validar(RedefinirSenhaDto, { novaSenha: 'novaSenha123' });
      expect(campos).toEqual({});
    });
  });
});
