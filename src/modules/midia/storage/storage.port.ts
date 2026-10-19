export const STORAGE_PORT = Symbol('STORAGE_PORT');

/** Não existe remoção física: a exclusão é lógica (RN25) e os arquivos ficam (D3.4). */
export interface StoragePort {
  /** Grava sem sobrescrever. Falha de infraestrutura lança ARMAZENAMENTO_INDISPONIVEL. */
  salvar(conteudo: Buffer, caminho: string, contentType: 'image/webp'): Promise<void>;
  /** Pura: monta a URL pública, sem chamada de rede. */
  urlPublica(caminho: string): string;
}
