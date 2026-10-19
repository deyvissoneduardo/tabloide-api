import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { v7 as uuidv7 } from 'uuid';
import { CriarCategoriaDto } from '../../categorias/dtos/criar-categoria.dto';
import { CriarProdutoDto } from '../dtos/criar-produto.dto';
import { EditarProdutoDto } from '../dtos/editar-produto.dto';
import { ListarProdutosQueryDto } from '../dtos/listar-produtos-query.dto';

async function validar<T extends object>(classe: new () => T, corpo: object) {
  const instancia = plainToInstance(classe, corpo);
  const erros = await validate(instancia, { whitelist: true, forbidNonWhitelisted: true });
  return {
    instancia,
    erros: Object.fromEntries(erros.map((e) => [e.property, Object.values(e.constraints ?? {})])),
  };
}

const CATEGORIA = uuidv7();
const minimo = { nome: 'Leite', categoriaId: CATEGORIA, precoPromocionalCentavos: 499 };

describe('Funcionalidade: Validação de entrada do produto', () => {
  describe('Cenário: cadastro mínimo válido', () => {
    it('Então não há erros', async () => expect((await validar(CriarProdutoDto, minimo)).erros).toEqual({}));
  });

  describe('Cenário: campos de multipart chegam como texto', () => {
    it('Então os preços viram os inteiros 2199 e 2649', async () => {
      const { instancia, erros } = await validar(CriarProdutoDto, {
        ...minimo,
        precoPromocionalCentavos: '2199',
        precoOriginalCentavos: '2649',
      });
      expect(erros).toEqual({});
      expect(instancia.precoPromocionalCentavos).toBe(2199);
      expect(instancia.precoOriginalCentavos).toBe(2649);
    });

    it('E campos opcionais vazios valem como não enviados', async () => {
      const { instancia, erros } = await validar(CriarProdutoDto, {
        ...minimo,
        precoOriginalCentavos: '',
        quantidade: '',
        dataLimite: '',
      });
      expect(erros).toEqual({});
      expect(instancia).toMatchObject({
        precoOriginalCentavos: undefined,
        quantidade: undefined,
        dataLimite: undefined,
      });
    });
  });

  describe('Esquema do Cenário: preço em formato inválido', () => {
    it.each(['21.99', 'abc', '0', ''])(
      'Dado precoPromocionalCentavos "%s", há erro no campo',
      async (valor) =>
        expect(
          (await validar(CriarProdutoDto, { ...minimo, precoPromocionalCentavos: valor })).erros
            .precoPromocionalCentavos,
        ).toBeDefined(),
    );
  });

  describe('Cenário: nome só com espaços', () => {
    it('Então há erro no campo nome', async () =>
      expect((await validar(CriarProdutoDto, { ...minimo, nome: '   ' })).erros.nome).toBeDefined());
  });

  describe('Cenário: nome é aparado', () => {
    it('Então o nome fica "Arroz Tipo 1"', async () =>
      expect((await validar(CriarProdutoDto, { ...minimo, nome: '  Arroz  Tipo 1 ' })).instancia.nome).toBe(
        'Arroz Tipo 1',
      ));
  });

  describe('Esquema do Cenário: tamanhos máximos', () => {
    it.each<[string, number, boolean]>([
      ['nome', 120, true],
      ['nome', 121, false],
      ['quantidade', 41, false],
      ['descricao', 501, false],
      ['observacao', 201, false],
    ])('Dado %s com %i caracteres, válido = %s', async (campo, n, valido) => {
      const { erros } = await validar(CriarProdutoDto, { ...minimo, [campo]: 'a'.repeat(n) });
      expect(erros[campo] === undefined).toBe(valido);
    });
  });

  describe('Esquema do Cenário: datas só com dia', () => {
    it.each([
      ['2026-10-25', true],
      ['2026-10-25T00:00:00Z', false],
      ['25/10/2026', false],
      ['2026-02-30', false],
    ])('Dado dataLimite "%s", válido = %s', async (valor, valido) =>
      expect(
        (await validar(CriarProdutoDto, { ...minimo, dataLimite: valor })).erros.dataLimite === undefined,
      ).toBe(valido),
    );
  });

  describe('Cenário: categoriaId inválido', () => {
    it('Então há erro no campo categoriaId', async () =>
      expect(
        (await validar(CriarProdutoDto, { ...minimo, categoriaId: '123' })).erros.categoriaId,
      ).toBeDefined());
  });

  describe('Cenário: campo desconhecido', () => {
    it('Então tenantId é propriedade não permitida', async () =>
      expect((await validar(CriarProdutoDto, { ...minimo, tenantId: 't2' })).erros.tenantId).toBeDefined());
  });

  describe('Cenário: edição vazia', () => {
    it('Então há erro "informe ao menos um campo"', async () =>
      expect((await validar(EditarProdutoDto, {})).erros.corpo).toEqual(['Informe ao menos um campo.']));
  });

  describe('Cenário: edição limpa campos opcionais com null', () => {
    it('Então não há erros', async () =>
      expect(
        (
          await validar(EditarProdutoDto, {
            precoOriginalCentavos: null,
            dataLimite: null,
            observacao: null,
            quantidade: null,
            descricao: null,
          })
        ).erros,
      ).toEqual({}));
  });

  describe('Cenário: edição com texto vazio limpa o campo', () => {
    it('Então observacao "  " vira null', async () => {
      const { instancia, erros } = await validar(EditarProdutoDto, { observacao: '  ' });
      expect(erros).toEqual({});
      expect(instancia.observacao).toBeNull();
    });
  });

  describe.each(['dataInicio', 'nome', 'categoriaId', 'precoPromocionalCentavos'])(
    'Cenário: edição não aceita %s nulo',
    (campo) => {
      it(`Então há erro no campo ${campo}`, async () =>
        expect((await validar(EditarProdutoDto, { [campo]: null })).erros[campo]).toBeDefined());
    },
  );

  describe('Cenário: filtro de lista com situação desconhecida', () => {
    it('Então há erro no campo situacao', async () =>
      expect((await validar(ListarProdutosQueryDto, { situacao: 'ativo' })).erros.situacao).toBeDefined());
  });

  describe('Cenário: porPagina acima do máximo', () => {
    it('Então há erro no campo porPagina', async () =>
      expect((await validar(ListarProdutosQueryDto, { porPagina: '101' })).erros.porPagina).toBeDefined());
  });

  describe('Cenário: query completa', () => {
    it('Então converte situação, paginação e apara a busca', async () => {
      const { instancia, erros } = await validar(ListarProdutosQueryDto, {
        categoriaId: CATEGORIA,
        situacao: 'vigente,agendado',
        busca: '  açúcar ',
        pagina: '2',
      });
      expect(erros).toEqual({});
      expect(instancia).toMatchObject({
        situacao: ['VIGENTE', 'AGENDADO'],
        busca: 'açúcar',
        pagina: 2,
        porPagina: 50,
      });
    });
  });
});

describe('Funcionalidade: Validação de entrada da categoria', () => {
  describe('Esquema do Cenário: nome', () => {
    it.each<[unknown, boolean]>([
      ['Mercearia', true],
      ['   ', false],
      ['a'.repeat(81), false],
      [undefined, false],
    ])('Dado nome %p, válido = %s', async (nome, valido) =>
      expect(Object.keys((await validar(CriarCategoriaDto, { nome })).erros).length === 0).toBe(valido),
    );

    it('E o nome é aparado', async () =>
      expect((await validar(CriarCategoriaDto, { nome: '  Mercearia  ' })).instancia.nome).toBe('Mercearia'));
  });
});
