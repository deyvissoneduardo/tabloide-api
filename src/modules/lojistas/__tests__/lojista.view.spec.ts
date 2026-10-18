import type { Lojista } from '../models/lojista.model';
import { StatusLojista } from '../models/status-lojista';
import { lojistaView } from '../views/lojista.view';

describe('Funcionalidade: View do lojista', () => {
  describe('Cenário: campos expostos', () => {
    it('Então tem exatamente os campos públicos, com criadoEm em ISO 8601', () => {
      const model = {
        id: 'id-1',
        nomeFantasia: 'Mercado',
        nomeResponsavel: 'Ana',
        email: 'ana@x.com',
        whatsapp: '+5511987654321',
        cnpj: null,
        senhaHash: '$argon2id$segredo',
        logoPath: 'logo.webp',
        corPrimaria: '#FF0000',
        corSecundaria: '#00FF00',
        createdAt: new Date('2026-10-18T15:00:00Z'),
      } as unknown as Lojista;

      const view = lojistaView(model, StatusLojista.ATIVO);

      expect(Object.keys(view).sort()).toEqual(
        ['id', 'nomeFantasia', 'nomeResponsavel', 'email', 'whatsapp', 'cnpj', 'status', 'criadoEm'].sort(),
      );
      expect(view.criadoEm).toBe('2026-10-18T15:00:00.000Z');
      expect(JSON.stringify(view)).not.toContain('segredo');
    });
  });
});
