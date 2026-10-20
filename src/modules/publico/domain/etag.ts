import { createHash } from 'node:crypto';

/** W/"<16 caracteres base64url do sha1 do conteúdo>". */
export function etagFraco(conteudo: string): string {
  return `W/"${createHash('sha1').update(conteudo).digest('base64url').slice(0, 16)}"`;
}

const semPrefixoFraco = (etag: string) => etag.trim().replace(/^W\//, '');

/** Comparação fraca (RFC 9110): ignora W/, aceita lista separada por vírgula e "*". */
export function ifNoneMatchContem(ifNoneMatch: string, etag: string): boolean {
  const alvo = semPrefixoFraco(etag);
  return ifNoneMatch.split(',').some((v) => v.trim() === '*' || semPrefixoFraco(v) === alvo);
}
