import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SalvarEstruturaDto } from '../dtos/salvar-estrutura.dto';

const ID_C = '0192f3a0-0000-7000-8000-000000000001';
const ID_P = '0192f3a0-0000-7000-8000-000000000002';

async function erros(corpo: unknown): Promise<string[]> {
  const resultado = await validate(plainToInstance(SalvarEstruturaDto, corpo));
  const mensagens: string[] = [];
  const coletar = (lista: typeof resultado) => {
    for (const erro of lista) {
      mensagens.push(...Object.values(erro.constraints ?? {}));
      coletar(erro.children ?? []);
    }
  };
  coletar(resultado);
  return mensagens;
}

describe('Funcionalidade: Validar o corpo da ordem da filial (RN45)', () => {
  describe('Cenário: corpo válido', () => {
    it('Então sem erros', async () =>
      expect(await erros({ categorias: [{ id: ID_C, produtos: [ID_P] }] })).toEqual([]));
  });

  describe('Cenário: lista vazia limpa a ordem', () => {
    it('Então sem erros', async () => expect(await erros({ categorias: [] })).toEqual([]));
  });

  describe('Cenário: mais de 500 categorias', () => {
    it('Então "No máximo 500 categorias."', async () =>
      expect(
        await erros({ categorias: Array.from({ length: 501 }, () => ({ id: ID_C, produtos: [] })) }),
      ).toContain('No máximo 500 categorias.'));
  });

  describe('Cenário: mais de 2000 produtos numa categoria', () => {
    it('Então "No máximo 2000 produtos por categoria."', async () =>
      expect(
        await erros({ categorias: [{ id: ID_C, produtos: Array.from({ length: 2001 }, () => ID_P) }] }),
      ).toContain('No máximo 2000 produtos por categoria.'));
  });

  describe('Cenário: id que não é UUID v7', () => {
    it('Então id de categoria e de produto inválidos', async () => {
      const mensagens = await erros({
        categorias: [{ id: '0192f3a0-0000-4000-8000-000000000001', produtos: ['abc'] }],
      });
      expect(mensagens).toEqual(
        expect.arrayContaining(['id de categoria inválido.', 'id de produto inválido.']),
      );
    });
  });

  describe('Cenário: produtos ausente', () => {
    it('Então "produtos deve ser uma lista."', async () =>
      expect(await erros({ categorias: [{ id: ID_C }] })).toContain('produtos deve ser uma lista.'));
  });

  describe('Cenário: categorias ausente', () => {
    it('Então "categorias deve ser uma lista."', async () =>
      expect(await erros({})).toContain('categorias deve ser uma lista.'));
  });
});
