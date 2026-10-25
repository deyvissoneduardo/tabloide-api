/** Endereço completo da filial, como gravado (CEP só com os 8 dígitos). */
export interface EnderecoFilial {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
}

export const CAMPOS_ENDERECO = [
  'cep',
  'logradouro',
  'numero',
  'complemento',
  'bairro',
  'cidade',
  'uf',
] as const satisfies ReadonlyArray<keyof EnderecoFilial>;
