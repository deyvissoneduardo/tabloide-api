import { v7 as uuidv7 } from 'uuid';
import type { PerfilImagem } from './perfis-imagem';

/** Caminho imutável: conteúdo novo gera arquivo novo, e a CDN pode cachear por 1 ano. */
export function montarCaminho(
  tenantId: string,
  perfil: PerfilImagem,
  extensao: 'webp' | 'pdf' = 'webp',
): string {
  return `${tenantId}/${perfil}/${uuidv7()}.${extensao}`;
}
