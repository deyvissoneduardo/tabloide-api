#!/usr/bin/env bash
# Protege a main no GitHub: só aceita mudanças via PR, sem force push nem exclusão.
# Admin pode contornar (enforce_admins=false); PR não exige aprovação de revisor.
# Rodar uma vez (idempotente). Requer gh autenticado com permissão de admin no repo.
set -euo pipefail

repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

gh api -X PUT "repos/$repo/branches/main/protection" --input - <<'EOF'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF

echo "main protegida em $repo."
