import { Logger } from '@nestjs/common';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import type { StoragePort } from './storage.port';

export const CACHE_CONTROL_MIDIA = '31536000';
const ESPERA_ANTES_DE_REPETIR_MS = 200;

interface ErroStorage {
  message: string;
  status?: number;
}

/** Parte do client do Supabase que o adapter usa; facilita o mock nos testes. */
export interface ClienteStorageSupabase {
  storage: {
    from(bucket: string): {
      upload(
        caminho: string,
        conteudo: Buffer,
        opcoes: { contentType: string; cacheControl: string; upsert: boolean },
      ): Promise<{ error: ErroStorage | null }>;
    };
  };
}

const esperarPadrao = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Falha de rede (sem status) ou 5xx: vale uma nova tentativa. */
const ehTransitorio = (erro: ErroStorage) => erro.status === undefined || erro.status >= 500;

export class SupabaseStorageAdapter implements StoragePort {
  private readonly logger = new Logger(SupabaseStorageAdapter.name);

  constructor(
    private readonly cliente: ClienteStorageSupabase,
    private readonly supabaseUrl: string,
    private readonly bucket: string,
    private readonly esperar: (ms: number) => Promise<void> = esperarPadrao,
  ) {}

  async salvar(
    conteudo: Buffer,
    caminho: string,
    contentType: 'image/webp' | 'application/pdf',
  ): Promise<void> {
    const opcoes = { contentType, cacheControl: CACHE_CONTROL_MIDIA, upsert: false };
    let { error } = await this.cliente.storage.from(this.bucket).upload(caminho, conteudo, opcoes);
    if (error && ehTransitorio(error)) {
      await this.esperar(ESPERA_ANTES_DE_REPETIR_MS);
      ({ error } = await this.cliente.storage.from(this.bucket).upload(caminho, conteudo, opcoes));
    }
    if (!error) return;

    // nunca loga a chave de serviço: só caminho, status e mensagem
    this.logger.error({
      evento: 'midia.upload_falhou',
      caminho,
      status: error.status,
      mensagem: error.message,
    });
    if (ehTransitorio(error)) throw new AppError(CodigoErro.ARMAZENAMENTO_INDISPONIVEL);
    // 409 (caminho repetido) ou 4xx de configuração (bucket inexistente, chave inválida)
    throw new Error(`falha ao gravar mídia no Supabase (${error.status}): ${error.message}`);
  }

  urlPublica(caminho: string): string {
    const segmentos = caminho.split('/').map(encodeURIComponent).join('/');
    return `${this.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(this.bucket)}/${segmentos}`;
  }
}
