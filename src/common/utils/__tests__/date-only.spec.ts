import { CodigoErro } from '../../errors/codigos-erro';
import {
  compararDatas,
  dataEHoraNoFuso,
  diasEntre,
  ehDataISO,
  ehFusoValido,
  formatarDiaMes,
  hojeNoFuso,
  paraDataISO,
  segundosAteMeiaNoite,
  somarDias,
  type DataISO,
} from '../date-only';

const d = (s: string) => s as DataISO;

describe('Funcionalidade: Datas sem hora', () => {
  describe('Cenário: data ISO válida', () => {
    it('Então "2026-10-18" é aceita', () => expect(ehDataISO('2026-10-18')).toBe(true));
  });

  describe('Cenário: formato inválido', () => {
    it.each(['18/10/2026', '2026-1-8', '2026-10-18T00:00:00Z', '', 'abc'])('Então "%s" é recusada', (v) =>
      expect(ehDataISO(v)).toBe(false),
    );
  });

  describe('Cenário: data de calendário inexistente', () => {
    it.each(['2026-02-30', '2026-13-01', '2026-00-10'])('Então "%s" é recusada', (v) =>
      expect(ehDataISO(v)).toBe(false),
    );
  });

  describe('Cenário: 29 de fevereiro', () => {
    it('Então vale em 2028 (bissexto) e não em 2026', () => {
      expect(ehDataISO('2028-02-29')).toBe(true);
      expect(ehDataISO('2026-02-29')).toBe(false);
    });
  });

  describe('Cenário: paraDataISO', () => {
    it('Então devolve a própria data quando válida', () =>
      expect(paraDataISO('2026-10-18')).toBe('2026-10-18'));
    it('Então lança VALIDACAO_INVALIDA com "2026-02-30"', () =>
      expect(() => paraDataISO('2026-02-30')).toThrow(
        expect.objectContaining({ codigo: CodigoErro.VALIDACAO_INVALIDA }),
      ));
  });

  describe('Cenário: hoje em São Paulo antes e depois da meia-noite local', () => {
    it('Então 02:30Z ainda é o dia anterior', () =>
      expect(hojeNoFuso('America/Sao_Paulo', new Date('2026-10-19T02:30:00Z'))).toBe('2026-10-18'));
    it('Então 03:00Z já é o dia seguinte', () =>
      expect(hojeNoFuso('America/Sao_Paulo', new Date('2026-10-19T03:00:00Z'))).toBe('2026-10-19'));
  });

  describe('Cenário: fusos diferentes no mesmo instante', () => {
    it('Então São Paulo já virou o dia e Manaus não', () => {
      const agora = new Date('2026-10-19T03:30:00Z');
      expect(hojeNoFuso('America/Sao_Paulo', agora)).toBe('2026-10-19');
      expect(hojeNoFuso('America/Manaus', agora)).toBe('2026-10-18');
    });
  });

  describe('Cenário: virada de ano', () => {
    it('Então 2027-01-01T02:59:59Z ainda é 31/12 em São Paulo', () =>
      expect(hojeNoFuso('America/Sao_Paulo', new Date('2027-01-01T02:59:59Z'))).toBe('2026-12-31'));
  });

  describe('Cenário: formatador reaproveitado', () => {
    it('Então Intl.DateTimeFormat é instanciado uma única vez por fuso', () => {
      const espiao = jest.spyOn(Intl, 'DateTimeFormat');
      hojeNoFuso('America/Recife', new Date());
      hojeNoFuso('America/Recife', new Date());
      expect(espiao).toHaveBeenCalledTimes(1);
      espiao.mockRestore();
    });
  });

  describe('Cenário: fuso válido e inválido', () => {
    it.each([
      ['America/Sao_Paulo', true],
      ['UTC', true],
      ['America/Noronha', true],
      ['Brasil/Leste', false],
      ['Mars/Olympus', false],
    ])('Então "%s" → %s', (fuso, esperado) => expect(ehFusoValido(fuso)).toBe(esperado));
  });

  describe('Cenário: comparar datas', () => {
    it('Então devolve -1, 0 e 1', () => {
      expect(compararDatas(d('2026-10-18'), d('2026-10-19'))).toBe(-1);
      expect(compararDatas(d('2026-10-19'), d('2026-10-19'))).toBe(0);
      expect(compararDatas(d('2026-12-01'), d('2026-10-31'))).toBe(1);
    });
  });

  describe('Cenário: formatar dia e mês', () => {
    it('Então "2026-03-05" vira "05/03"', () => expect(formatarDiaMes(d('2026-03-05'))).toBe('05/03'));
  });

  describe('Esquema do Cenário: segundos até a virada do dia no fuso (RN24, RNF06)', () => {
    it.each([
      ['2026-10-18T15:00:00Z', 'America/Sao_Paulo', 43200],
      ['2026-10-19T02:59:30Z', 'America/Sao_Paulo', 30],
      ['2026-10-19T03:00:00Z', 'America/Sao_Paulo', 86400],
      ['2026-10-19T03:59:59Z', 'America/Manaus', 1],
      ['2026-10-19T04:30:00Z', 'America/Rio_Branco', 1800],
      ['2026-10-19T05:30:00Z', 'America/Rio_Branco', 84600],
    ])('Dado %s em %s, então %i', (agora, fuso, segundos) =>
      expect(segundosAteMeiaNoite(fuso, new Date(agora))).toBe(segundos),
    );

    it('E nunca devolve zero (meia-noite menos 0,4 s)', () =>
      expect(
        segundosAteMeiaNoite('America/Sao_Paulo', new Date('2026-10-19T02:59:59.600Z')),
      ).toBeGreaterThanOrEqual(1));
  });

  describe('Cenário: mesmo instante, dias diferentes por fuso', () => {
    it('Então São Paulo já está em 19/10 e Manaus ainda em 18/10', () => {
      const agora = new Date('2026-10-19T03:30:00Z');
      expect([hojeNoFuso('America/Sao_Paulo', agora), hojeNoFuso('America/Manaus', agora)]).toEqual([
        '2026-10-19',
        '2026-10-18',
      ]);
    });
  });

  describe('Esquema do Cenário: data e hora locais na virada do dia (RN51, RN53)', () => {
    it.each([
      ['2026-10-19T02:59:59Z', 'America/Sao_Paulo', '2026-10-18', 23],
      ['2026-10-19T03:00:00Z', 'America/Sao_Paulo', '2026-10-19', 0],
      ['2026-10-19T03:59:59Z', 'America/Manaus', '2026-10-18', 23],
      ['2026-10-19T04:00:00Z', 'America/Manaus', '2026-10-19', 0],
      ['2026-10-19T01:59:59Z', 'America/Noronha', '2026-10-18', 23],
      ['2026-10-19T02:00:00Z', 'America/Noronha', '2026-10-19', 0],
      ['2027-01-01T02:30:00Z', 'America/Sao_Paulo', '2026-12-31', 23],
    ])('Dado %s em %s, então %s às %ih', (agora, fuso, data, hora) =>
      expect(dataEHoraNoFuso(fuso, new Date(agora))).toEqual({ data, hora }),
    );
  });

  describe('Esquema do Cenário: somar dias à data pura', () => {
    it.each([
      ['2026-10-18', 0, '2026-10-18'],
      ['2026-10-31', 1, '2026-11-01'],
      ['2026-12-31', 1, '2027-01-01'],
      ['2027-01-01', -1, '2026-12-31'],
      ['2028-02-28', 1, '2028-02-29'],
      ['2026-02-28', 1, '2026-03-01'],
      ['2026-11-09', -29, '2026-10-11'],
    ])('Dado %s + %i, então %s', (data, dias, esperado) => expect(somarDias(d(data), dias)).toBe(esperado));
  });

  describe('Esquema do Cenário: dias entre duas datas', () => {
    it.each([
      ['2026-10-18', '2026-10-18', 0],
      ['2026-10-18', '2026-10-19', 1],
      ['2026-10-19', '2026-10-18', -1],
      ['2026-12-31', '2027-01-01', 1],
      ['2028-01-01', '2028-12-31', 365],
      ['2026-01-01', '2026-12-31', 364],
      ['2026-10-01', '2026-11-30', 60],
    ])('Dado %s → %s, então %i', (inicio, fim, dias) => expect(diasEntre(d(inicio), d(fim))).toBe(dias));
  });
});
