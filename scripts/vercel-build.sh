#!/usr/bin/env bash
# Build na Vercel: substitui o api-ci/api-deploy do GitHub Actions.
# Gate de qualidade antes de publicar; lint e integração (Docker) ficam só locais.
set -euo pipefail

npm run typecheck
npm test

# Só o deploy de produção migra: preview e produção usam o mesmo banco.
# Migrations rodam antes da troca e precisam ser compatíveis com o código anterior
# (expandir → migrar → contrair); o rollback da Vercel não reverte migrations.
if [ "${VERCEL_ENV:-}" = "production" ]; then
  npm run db:migrate
fi

npm run build
