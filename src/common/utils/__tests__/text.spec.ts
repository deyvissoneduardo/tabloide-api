import {
  compararTextoPtBr,
  normalizarCnpj,
  normalizarEmail,
  normalizarEspacos,
  normalizarWhatsappBr,
  somenteDigitos,
} from '../text';

describe('Funcionalidade: Normalização de texto', () => {
  describe('Cenário: ordenação pt-BR ignora acento e caixa', () => {
    it('Então resulta ["Abacaxi", "Açúcar", "arroz", "feijão", "Óleo"]', () =>
      expect(['Óleo', 'arroz', 'Açúcar', 'feijão', 'Abacaxi'].sort(compararTextoPtBr)).toEqual([
        'Abacaxi',
        'Açúcar',
        'arroz',
        'feijão',
        'Óleo',
      ]));
  });

  describe('Cenário: ordenação numérica natural', () => {
    it('Então "Item 2" vem antes de "Item 10"', () =>
      expect(['Item 10', 'Item 2'].sort(compararTextoPtBr)).toEqual(['Item 2', 'Item 10']));
  });

  describe('Cenário: normalizar espaços', () => {
    it('Então apara e colapsa espaços internos', () =>
      expect(normalizarEspacos('  Mercado   Bom \t Preço  ')).toBe('Mercado Bom Preço'));
  });

  describe('Cenário: normalizar e-mail', () => {
    it('Então apara e põe em minúsculas', () =>
      expect(normalizarEmail(' Ana@BomPreco.COM.br ')).toBe('ana@bompreco.com.br'));
  });

  describe('Cenário: somente dígitos', () => {
    it('Então remove máscara', () => expect(somenteDigitos('(11) 9-87')).toBe('11987'));
  });

  describe('Cenário: WhatsApp celular com máscara', () => {
    it('Então devolve E.164', () => expect(normalizarWhatsappBr('(11) 98765-4321')).toBe('+5511987654321'));
  });

  describe('Cenário: WhatsApp já com DDI', () => {
    it.each(['+55 11 98765-4321', '5511987654321'])('Então "%s" vira +5511987654321', (v) =>
      expect(normalizarWhatsappBr(v)).toBe('+5511987654321'),
    );
  });

  describe('Cenário: WhatsApp fixo com 10 dígitos', () => {
    it('Então devolve +556133334444', () =>
      expect(normalizarWhatsappBr('(61) 3333-4444')).toBe('+556133334444'));
  });

  describe('Cenário: WhatsApp inválido', () => {
    it.each([
      '98765-4321',
      '(01) 98765-4321',
      '(10) 98765-4321',
      '(11) 88765-4321',
      '119876543210',
      '',
      'abc',
    ])('Então "%s" devolve null', (v) => expect(normalizarWhatsappBr(v)).toBeNull());
  });

  describe('Cenário: CNPJ válido com e sem máscara', () => {
    it.each(['11.222.333/0001-81', '11222333000181'])('Então "%s" vira 14 dígitos', (v) =>
      expect(normalizarCnpj(v)).toBe('11222333000181'),
    );
  });

  describe('Cenário: CNPJ com dígito verificador zero', () => {
    it('Então aceita CNPJ cujo DV calculado é 0', () =>
      expect(normalizarCnpj('11.444.777/0001-61')).toBe('11444777000161'));
  });

  describe('Cenário: CNPJ com dígito verificador errado', () => {
    it.each(['11.222.333/0001-82', '11.222.333/0001-91'])('Então "%s" devolve null', (v) =>
      expect(normalizarCnpj(v)).toBeNull(),
    );
  });

  describe('Cenário: CNPJ com dígitos repetidos', () => {
    it.each(['00.000.000/0000-00', '11111111111111'])('Então "%s" devolve null', (v) =>
      expect(normalizarCnpj(v)).toBeNull(),
    );
  });

  describe('Cenário: CNPJ com tamanho errado', () => {
    it.each(['1122233300018', '112223330001811'])('Então "%s" devolve null', (v) =>
      expect(normalizarCnpj(v)).toBeNull(),
    );
  });
});
