import { normalizarFuso } from '../domain/fuso';

describe('Funcionalidade: Normalização de fuso horário (RN38)', () => {
  describe('Esquema do Cenário: fusos aceitos e normalizados', () => {
    it.each([
      ['America/Sao_Paulo', 'America/Sao_Paulo'],
      ['america/sao_paulo', 'America/Sao_Paulo'],
      ['America/Manaus', 'America/Manaus'],
      ['America/Rio_Branco', 'America/Rio_Branco'],
      ['America/Noronha', 'America/Noronha'],
      ['America/Belem', 'America/Belem'],
    ])('Dado "%s", então recebo "%s"', (entrada, saida) => expect(normalizarFuso(entrada)).toBe(saida));
  });

  describe('Esquema do Cenário: fusos recusados', () => {
    it.each(['Marte/Olympus', '', 'UTC', 'GMT', 'Etc/GMT+3', '+03:00', 'BRT', `America/${'x'.repeat(57)}`])(
      'Dado "%s", então recebo nulo',
      (entrada) => expect(normalizarFuso(entrada)).toBeNull(),
    );
  });

  describe('Cenário: entrada não string', () => {
    it.each([123, null, undefined, {}])('Dado %p, então recebo nulo', (v) =>
      expect(normalizarFuso(v)).toBeNull(),
    );
  });

  describe('Cenário: memoização', () => {
    it('Então Intl.DateTimeFormat não é construído de novo para o mesmo fuso', () => {
      normalizarFuso('America/Cuiaba');
      const espiao = jest.spyOn(Intl, 'DateTimeFormat');
      expect(normalizarFuso('America/Cuiaba')).toBe('America/Cuiaba');
      expect(normalizarFuso('America/Cuiaba')).toBe('America/Cuiaba');
      expect(espiao).not.toHaveBeenCalled();
      espiao.mockRestore();
    });

    it('E um fuso inválido também é memorizado', () => {
      normalizarFuso('Lua/Crateras');
      const espiao = jest.spyOn(Intl, 'DateTimeFormat');
      expect(normalizarFuso('Lua/Crateras')).toBeNull();
      expect(espiao).not.toHaveBeenCalled();
      espiao.mockRestore();
    });
  });
});
