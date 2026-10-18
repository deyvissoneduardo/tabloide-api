export const CENTAVOS_MAXIMO = 99_999_999;

export function ehCentavosValido(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= CENTAVOS_MAXIMO;
}

const formatadorReais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function centavosParaReais(c: number): string {
  return formatadorReais.format(c / 100);
}
