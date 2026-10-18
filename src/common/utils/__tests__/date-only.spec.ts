import { CodigoErro } from '../../errors/codigos-erro';
import {
  compararDatas,
  ehDataISO,
  ehFusoValido,
  formatarDiaMes,
  hojeNoFuso,
  paraDataISO,
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
});
