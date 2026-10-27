import type { DataISO } from '../../../common/utils/date-only';
import type { Panfleto } from '../models/panfleto.model';
import { panfletoView } from '../views/panfleto.view';

const HOJE = '2026-10-18' as DataISO;
const panfleto = (dados: Record<string, unknown> = {}) =>
  ({
    id: 'p1',
    tenantId: 't1',
    filialId: 'f1',
    imagemPath: 't1/panfleto/a.webp',
    imagemLargura: 1697,
    imagemAltura: 2400,
    tipoArquivo: 'IMAGEM',
    dataInicio: '2026-10-01',
    dataLimite: '2026-10-31',
    createdAt: new Date('2026-10-01T12:00:00Z'),
    deletedAt: null,
    ...dados,
  }) as unknown as Panfleto;

describe('Funcionalidade: Apresentar panfleto', () => {
  describe('Cenário: campos expostos', () => {
    it('Então tem exatamente os campos públicos, sem imagemPath nem tenantId', () => {
      const view = panfletoView(panfleto(), HOJE, 'https://cdn/a.webp');
      expect(view).toEqual({
        id: 'p1',
        filialId: 'f1',
        tipo: 'IMAGEM',
        urlArquivo: 'https://cdn/a.webp',
        urlImagem: 'https://cdn/a.webp',
        largura: 1697,
        altura: 2400,
        dataInicio: '2026-10-01',
        dataLimite: '2026-10-31',
        situacao: 'VIGENTE',
        editavel: true,
        criadoEm: '2026-10-01T12:00:00.000Z',
        excluidoEm: null,
      });
    });
  });

  describe('Cenário: panfleto em PDF (RN13, T4)', () => {
    it('Então tipo PDF, urlArquivo e urlImagem iguais, sem imagemPath', () => {
      const view = panfletoView(
        panfleto({ tipoArquivo: 'PDF', imagemPath: 't1/panfleto/a.pdf' }),
        HOJE,
        'https://cdn/a.pdf',
      );
      expect(view).toMatchObject({
        tipo: 'PDF',
        urlArquivo: 'https://cdn/a.pdf',
        urlImagem: 'https://cdn/a.pdf',
      });
      expect(JSON.stringify(view)).not.toContain('imagemPath');
    });
  });

  describe('Esquema do Cenário: editavel por situação', () => {
    it.each([
      ['AGENDADO', { dataInicio: '2026-11-01' }, true],
      ['VIGENTE', {}, true],
      ['VENCIDO', { dataLimite: '2026-10-10' }, false],
      ['EXCLUIDO', { deletedAt: new Date('2026-10-15T00:00:00Z') }, false],
    ])('Dado %s, editavel é %s', (situacao, dados, editavel) =>
      expect(panfletoView(panfleto(dados), HOJE, 'u')).toMatchObject({ situacao, editavel }),
    );
  });
});
