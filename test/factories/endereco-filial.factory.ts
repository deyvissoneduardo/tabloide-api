import type { EnderecoFilial } from '../../src/modules/filiais/domain/endereco';

/** Corpo de endereço válido para POST/PATCH de filial; aceita campos extras para testar recusas. */
export const umEnderecoDto = (dados: Record<string, unknown> = {}) => ({
  cep: '01310-100',
  logradouro: 'Rua das Flores',
  numero: '120',
  bairro: 'Centro',
  cidade: 'São Paulo',
  uf: 'SP',
  ...dados,
});

/** O mesmo endereço como gravado e devolvido pela API (CEP só com dígitos). */
export const umEndereco = (dados: Partial<EnderecoFilial> = {}): EnderecoFilial => ({
  cep: '01310100',
  logradouro: 'Rua das Flores',
  numero: '120',
  complemento: null,
  bairro: 'Centro',
  cidade: 'São Paulo',
  uf: 'SP',
  ...dados,
});
