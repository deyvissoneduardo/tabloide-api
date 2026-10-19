import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StoragePort } from './storage.port';

/** Armazenamento em disco para desenvolvimento e testes; o zod impede o uso em produção. */
export class DiskStorageAdapter implements StoragePort {
  private readonly raiz: string;

  constructor(
    diretorio: string,
    private readonly urlBase: string,
  ) {
    this.raiz = path.resolve(diretorio);
  }

  async salvar(conteudo: Buffer, caminho: string): Promise<void> {
    const destino = path.resolve(this.raiz, caminho);
    if (!destino.startsWith(this.raiz + path.sep)) {
      throw new Error(`caminho de mídia fora da raiz: ${caminho}`);
    }
    await mkdir(path.dirname(destino), { recursive: true });
    // 'wx' falha se o arquivo já existe: nunca sobrescreve
    await writeFile(destino, conteudo, { flag: 'wx' });
  }

  urlPublica(caminho: string): string {
    return `${this.urlBase}/${caminho}`;
  }
}
