import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { errosDeValidacaoParaAppError } from '../../../common/errors/validacao';
import { EditarIdentidadeDto } from '../../lojistas/dtos/editar-identidade.dto';
import { CriarPanfletoDto } from '../dtos/criar-panfleto.dto';
import { EditarDatasPanfletoDto } from '../dtos/editar-datas-panfleto.dto';
import { ListarPanfletosQueryDto } from '../dtos/listar-panfletos-query.dto';

async function validar<T extends object>(classe: new () => T, corpo: object) {
  const instancia = plainToInstance(classe, corpo);
  const erros = await validate(instancia, { whitelist: true, forbidNonWhitelisted: true });
  return {
    instancia,
    erros: Object.fromEntries(erros.map((e) => [e.property, Object.values(e.constraints ?? {})])),
  };
}

describe('Funcionalidade: Validar entrada de panfleto e identidade', () => {
  describe('Esquema do Cenário: datas do panfleto', () => {
    it.each([
      ['2026-10-31', true],
      ['', true],
      ['31/10/2026', false],
      ['2026-02-30', false],
      ['2026-13-01', false],
      ['2026-10-31T00:00:00Z', false],
    ])('Dado dataLimite "%s", válido = %s', async (valor, valido) =>
      expect(Object.keys((await validar(CriarPanfletoDto, { dataLimite: valor })).erros).length === 0).toBe(
        valido,
      ),
    );

    it('E campo vazio vira undefined', async () =>
      expect((await validar(CriarPanfletoDto, { dataInicio: '' })).instancia.dataInicio).toBeUndefined());
  });

  describe('Cenário: campo desconhecido', () => {
    it('Então tenantId é recusado pelo ValidationPipe', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: errosDeValidacaoParaAppError,
      });
      await expect(
        pipe.transform({ tenantId: 't2' }, { type: 'body', metatype: CriarPanfletoDto }),
      ).rejects.toMatchObject({
        codigo: 'VALIDACAO_INVALIDA',
      });
    });
  });

  describe('Cenário: edição vazia', () => {
    it('Então "Informe dataInicio ou dataLimite."', async () =>
      expect((await validar(EditarDatasPanfletoDto, {})).erros.corpo).toEqual([
        'Informe dataInicio ou dataLimite.',
      ]));
  });

  describe('Cenário: dataLimite null é permitido na edição', () => {
    it('Então passa', async () =>
      expect((await validar(EditarDatasPanfletoDto, { dataLimite: null })).erros).toEqual({}));
  });

  describe('Cenário: dataInicio null é recusado na edição', () => {
    it('Então falha em dataInicio', async () =>
      expect((await validar(EditarDatasPanfletoDto, { dataInicio: null })).erros.dataInicio).toBeDefined());
  });

  describe('Cenário: situação em CSV na listagem', () => {
    it('Então " vigente , agendado " vira [VIGENTE, AGENDADO]', async () => {
      const { instancia, erros } = await validar(ListarPanfletosQueryDto, {
        situacao: ' vigente , agendado ',
      });
      expect(erros).toEqual({});
      expect(instancia.situacao).toEqual(['VIGENTE', 'AGENDADO']);
    });

    it('E situação desconhecida é recusada', async () =>
      expect((await validar(ListarPanfletosQueryDto, { situacao: 'ATIVO' })).erros.situacao).toBeDefined());
  });

  describe('Esquema do Cenário: cores da identidade', () => {
    it.each<[unknown, boolean]>([
      ['#C8102E', true],
      ['#c8102e', true],
      [null, true],
      ['C8102E', false],
      ['#FFF', false],
      ['red', false],
      ['#GGGGGG', false],
    ])('Dado corPrimaria %p, válido = %s', async (valor, valido) =>
      expect(
        Object.keys((await validar(EditarIdentidadeDto, { corPrimaria: valor })).erros).length === 0,
      ).toBe(valido),
    );

    it('E a cor sai em maiúsculas', async () =>
      expect((await validar(EditarIdentidadeDto, { corSecundaria: '#ffd100' })).instancia.corSecundaria).toBe(
        '#FFD100',
      ));

    it('E corpo vazio é recusado', async () =>
      expect((await validar(EditarIdentidadeDto, {})).erros.corpo).toEqual(['Informe ao menos um campo.']));

    it('E o nome fantasia é aparado', async () =>
      expect(
        (await validar(EditarIdentidadeDto, { nomeFantasia: '  Mercado Novo  ' })).instancia.nomeFantasia,
      ).toBe('Mercado Novo'));
  });
});
