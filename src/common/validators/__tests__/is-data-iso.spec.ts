import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IsDataISO } from '../is-data-iso.validator';

class ComData {
  @IsDataISO()
  data!: unknown;
}

class ComDataAnulavel {
  @IsDataISO({ anulavel: true })
  data!: unknown;
}

const valida = async (classe: new () => object, data: unknown) =>
  (await validate(plainToInstance(classe, { data }))).length === 0;

describe('Funcionalidade: Validação de data sem hora (RN24)', () => {
  describe('Esquema do Cenário: valores', () => {
    it.each<[unknown, boolean]>([
      ['2026-10-18', true],
      ['2028-02-29', true],
      ['2026-02-29', false],
      ['2026-13-01', false],
      ['2026-04-31', false],
      ['2026-10-18T00:00:00Z', false],
      ['18/10/2026', false],
      ['2026-1-8', false],
      [20261018, false],
      [null, false],
    ])('Dado %p, então válido = %s', async (valor, esperado) =>
      expect(await valida(ComData, valor)).toBe(esperado),
    );
  });

  describe('Cenário: null é aceito quando o campo é anulável', () => {
    it('Então é válido', async () => expect(await valida(ComDataAnulavel, null)).toBe(true));
    it('E data inválida continua recusada', async () =>
      expect(await valida(ComDataAnulavel, '2026-02-30')).toBe(false));
  });

  describe('Cenário: mensagem em português', () => {
    it('Então cita o campo e o formato', async () => {
      const [erro] = await validate(plainToInstance(ComData, { data: 'x' }));
      expect(Object.values(erro!.constraints!)).toEqual([
        'data deve ser uma data válida no formato AAAA-MM-DD',
      ]);
    });
  });
});
