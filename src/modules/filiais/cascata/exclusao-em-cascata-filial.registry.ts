import { Injectable } from '@nestjs/common';
import type { ExclusaoEmCascataFilial } from './exclusao-em-cascata-filial';

@Injectable()
export class ExclusaoEmCascataFilialRegistry {
  private readonly handlers: ExclusaoEmCascataFilial[] = [];

  registrar(handler: ExclusaoEmCascataFilial): void {
    if (this.handlers.some((h) => h.nome === handler.nome)) {
      throw new Error(`handler de cascata duplicado: ${handler.nome}`);
    }
    this.handlers.push(handler);
  }

  listar(): readonly ExclusaoEmCascataFilial[] {
    return [...this.handlers].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
  }
}
