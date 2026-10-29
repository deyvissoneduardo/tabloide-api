export type PerfilImagem = 'panfleto' | 'produto' | 'logo' | 'banner';

export interface ConfiguracaoPerfil {
  /** Lado maior máximo, em pixels; imagens menores não são ampliadas. */
  ladoMaximo: number;
  qualidade: number;
  effort: number;
}

/**
 * O panfleto tem resolução para o zoom de pinça (RNF01); o logo mantém transparência; a foto do
 * banner (RN46) é exibida em 16:9 na largura da página.
 */
export const PERFIS_IMAGEM: Record<PerfilImagem, ConfiguracaoPerfil> = {
  panfleto: { ladoMaximo: 2400, qualidade: 80, effort: 4 },
  produto: { ladoMaximo: 800, qualidade: 78, effort: 4 },
  logo: { ladoMaximo: 512, qualidade: 85, effort: 4 },
  banner: { ladoMaximo: 1600, qualidade: 80, effort: 4 },
};
