import {
  compararTextoPtBr,
  escaparLike,
  normalizarCnpj,
  normalizarEmail,
  normalizarEspacos,
  normalizarParaBusca,
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

  describe('Esquema do Cenário: normalizar para busca e ordenação (D4.2)', () => {
    it.each([
      ['Açúcar Refinado', 'acucar refinado'],
      ['ÁGUA   MINERAL', 'agua mineral'],
      ['  Pão de Queijo', 'pao de queijo'],
      ['Café 3 Corações', 'cafe 3 coracoes'],
      ['Hortifrúti', 'hortifruti'],
    ])('Dado "%s", então obtenho "%s"', (entrada, saida) => expect(normalizarParaBusca(entrada)).toBe(saida));
  });

  describe('Cenário: a ordem pelo texto normalizado segue o alfabeto pt-BR', () => {
    it('Então "Ábacate", "Arroz", "Banana", "Óleo"', () => {
      const chave = (s: string) => normalizarParaBusca(s);
      const ordenado = ['Óleo', 'Arroz', 'Ábacate', 'Banana'].sort((a, b) =>
        chave(a) < chave(b) ? -1 : chave(a) > chave(b) ? 1 : 0,
      );
      expect(ordenado).toEqual(['Ábacate', 'Arroz', 'Banana', 'Óleo']);
    });
  });

  describe('Cenário: escapar curingas do LIKE', () => {
    it('Então %, _ e \\ ganham barra', () => expect(escaparLike('100%_a\\b')).toBe('100\\%\\_a\\\\b'));
  });

  describe('Funcionalidade: Ordenação alfabética em português (RN30)', () => {
    it('Cenário: acentos e maiúsculas não alteram a ordem primária', () =>
      expect(['Água', 'Açúcar', 'abacate'].sort(compararTextoPtBr)).toEqual(['abacate', 'Açúcar', 'Água']));

    it('Cenário: números são comparados pelo valor', () =>
      expect(['Arroz 10kg', 'Arroz 2kg', 'Arroz 5kg'].sort(compararTextoPtBr)).toEqual([
        'Arroz 2kg',
        'Arroz 5kg',
        'Arroz 10kg',
      ]));

    it('Cenário: nomes iguais ignorando acento e caixa', () =>
      expect(compararTextoPtBr('Cafe', 'Café')).toBe(0));
  });
});
