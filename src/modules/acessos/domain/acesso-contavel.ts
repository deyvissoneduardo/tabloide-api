/** Dados da requisição à página pública que decidem se o acesso conta (RN50). */
export interface RequisicaoPublica {
  metodo: string;
  userAgent?: string;
  origem?: unknown;
}

/** Robôs de prévia de link, buscadores, monitores e clientes HTTP de linha de comando. */
export const PADRAO_ROBO =
  /bot|crawler|spider|slurp|facebookexternalhit|whatsapp|telegrambot|discordbot|slackbot|twitterbot|linkedinbot|embedly|preview|headlesschrome|lighthouse|curl|wget|python-requests|axios|node-fetch|go-http-client|okhttp|k6|postman/i;

/**
 * RN50: conta um carregamento real da página. HEAD não é carregamento; user-agent vazio ou de
 * robô não é pessoa; `origem=painel` é o lojista vendo a própria página. Outro valor de origem é ignorado.
 */
export function ehAcessoContavel(r: RequisicaoPublica): boolean {
  if (r.metodo.toUpperCase() !== 'GET') return false;
  if (r.origem === 'painel') return false;
  const ua = r.userAgent?.trim() ?? '';
  if (ua.length === 0) return false;
  return !PADRAO_ROBO.test(ua);
}
