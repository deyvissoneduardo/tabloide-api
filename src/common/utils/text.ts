export const collatorPtBr = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

export function compararTextoPtBr(a: string, b: string): number {
  return collatorPtBr.compare(a, b);
}

export function normalizarEspacos(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

export function normalizarEmail(s: string): string {
  return s.trim().toLowerCase();
}

export function somenteDigitos(s: string): string {
  return s.replace(/\D/g, '');
}

export function normalizarWhatsappBr(s: string): string | null {
  let digitos = somenteDigitos(s);
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) {
    digitos = digitos.slice(2);
  }
  if (digitos.length !== 10 && digitos.length !== 11) return null;
  if (digitos[0] === '0' || digitos[1] === '0') return null;
  if (digitos.length === 11 && digitos[2] !== '9') return null;
  return `+55${digitos}`;
}

const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function digitoVerificador(digitos: string, pesos: number[]): number {
  const soma = pesos.reduce((acc, peso, i) => acc + Number(digitos[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function normalizarCnpj(s: string): string | null {
  const digitos = somenteDigitos(s);
  if (digitos.length !== 14 || /^(\d)\1{13}$/.test(digitos)) return null;
  const dv1 = digitoVerificador(digitos, PESOS_DV1);
  const dv2 = digitoVerificador(digitos, PESOS_DV2);
  return Number(digitos[12]) === dv1 && Number(digitos[13]) === dv2 ? digitos : null;
}

/** Chave de busca e de ordenação (D4.2): minúsculas, sem acento, espaços colapsados. */
export function normalizarParaBusca(s: string): string {
  return normalizarEspacos(s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase());
}

/** Escapa os curingas do LIKE (o Postgres usa "\" como escape por padrão). */
export function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
