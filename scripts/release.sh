#!/usr/bin/env bash
# Aprova (merge) uma PR para a main e cria a tag de versão informada manualmente.
# Uso: npm run release [-- <número da PR> [vX.Y.Z]]; o que faltar é perguntado.
# Requer gh autenticado (gh auth login).
set -euo pipefail

erro() { echo "erro: $*" >&2; exit 1; }

gh auth status >/dev/null 2>&1 || erro "gh não autenticado; rode: gh auth login"

pr="${1:-}"
[ -n "$pr" ] || read -rp "Número da PR para a main: " pr
[[ "$pr" =~ ^[0-9]+$ ]] || erro "número de PR inválido: '$pr'"

IFS=$'\t' read -r estado base titulo < <(gh pr view "$pr" --json state,baseRefName,title -q '[.state, .baseRefName, .title] | @tsv')
[ "$base" = "main" ] || erro "a PR #$pr aponta para '$base', não para main"
[ "$estado" = "OPEN" ] || erro "a PR #$pr não está aberta (estado: $estado)"

git fetch -q --tags origin
ultima="$(git tag --list 'v*' --sort=-v:refname | head -n1)"
echo "PR #$pr: $titulo"
echo "Última tag: ${ultima:-nenhuma}"

tag="${2:-}"
[ -n "$tag" ] || read -rp "Nova tag (vX.Y.Z): " tag
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || erro "tag fora do formato vX.Y.Z: '$tag'"
git rev-parse -q --verify "refs/tags/$tag" >/dev/null && erro "a tag $tag já existe"
if [ -n "$ultima" ] && [ "$(printf '%s\n%s\n' "$ultima" "$tag" | sort -V | tail -n1)" != "$tag" ]; then
  erro "a tag $tag não é maior que a última ($ultima)"
fi

read -rp "Fazer merge da PR #$pr na main e criar $tag? [s/N] " ok
[[ "$ok" =~ ^[sS]$ ]] || erro "cancelado"

gh pr merge "$pr" --merge
sha="$(gh pr view "$pr" --json mergeCommit -q .mergeCommit.oid)"
[ -n "$sha" ] || erro "merge sem commit registrado; crie a tag manualmente"

git fetch -q origin main
git tag -a "$tag" "$sha" -m "$tag: $titulo (#$pr)"
git push -q origin "$tag"
echo "Tag $tag criada em ${sha:0:7} e enviada."
