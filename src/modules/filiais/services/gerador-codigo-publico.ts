import { Injectable } from '@nestjs/common';
import { customAlphabet } from 'nanoid';

export const GERADOR_CODIGO_PUBLICO = Symbol('GERADOR_CODIGO_PUBLICO');

export interface GeradorCodigoPublico {
  gerar(): string;
}

/** 55 símbolos sem os ambíguos 0 1 i l o I O: cerca de 46 bits em 8 caracteres. */
export const ALFABETO_CODIGO = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
export const TAMANHO_CODIGO = 8;

@Injectable()
export class NanoidGeradorCodigoPublico implements GeradorCodigoPublico {
  private readonly gerarCodigo = customAlphabet(ALFABETO_CODIGO, TAMANHO_CODIGO);

  gerar(): string {
    return this.gerarCodigo();
  }
}
