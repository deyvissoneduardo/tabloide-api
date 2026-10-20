#!/usr/bin/env bash
# Teste de restauração do backup (RNF08). Mensal, no primeiro domingo; registre o resultado
# em docs/operacao/backup.md. Uso:
#   BACKUP_S3_ENDPOINT=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
#   BACKUP_AGE_IDENTITY=~/.config/tabloide/backup.key CODIGO_FILIAL_TESTE=k7Qm2xPa \
#   scripts/restaurar-backup.sh [AAAA/MM/DD]
set -euo pipefail

BUCKET="${BACKUP_BUCKET:-tabloide-backups}"
DIA="${1:-$(date -u +%Y/%m/%d)}"
CONTAINER="tabloide-restauracao-$$"
PASTA="$(mktemp -d)"
INICIO=$(date +%s)

limpar() {
  docker rm -f "$CONTAINER" > /dev/null 2>&1 || true
  rm -rf "$PASTA"
}
trap limpar EXIT

echo "==> Baixando db/$DIA.dump.age"
aws s3 cp "s3://$BUCKET/db/$DIA.dump.age" "$PASTA/backup.dump.age" --endpoint-url "$BACKUP_S3_ENDPOINT"

echo "==> Descriptografando"
age -d -i "$BACKUP_AGE_IDENTITY" -o "$PASTA/backup.dump" "$PASTA/backup.dump.age"

echo "==> Postgres 16 descartável"
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=restauracao -e POSTGRES_DB=tabloide \
  -p 55432:5432 postgres:16 > /dev/null
until docker exec "$CONTAINER" pg_isready -U postgres > /dev/null 2>&1; do sleep 1; done

echo "==> pg_restore"
docker cp "$PASTA/backup.dump" "$CONTAINER:/tmp/backup.dump"
docker exec "$CONTAINER" pg_restore -U postgres -d tabloide --no-owner /tmp/backup.dump

URL="postgres://postgres:restauracao@localhost:55432/tabloide"

echo "==> Migrations em dia?"
DATABASE_URL_MIGRATIONS="$URL" npx sequelize-cli db:migrate:status | tee "$PASTA/status.txt"
if grep -q '^down' "$PASTA/status.txt"; then
  echo "ERRO: há migrations pendentes no backup" >&2
  exit 1
fi

echo "==> Consultas de sanidade"
docker exec "$CONTAINER" psql -U postgres -d tabloide -At -c "
  SELECT 'lojistas', count(*) FROM lojistas
  UNION ALL SELECT 'filiais', count(*) FROM filiais WHERE deleted_at IS NULL
  UNION ALL SELECT 'produtos', count(*) FROM produtos WHERE deleted_at IS NULL;"

if [ -n "${CODIGO_FILIAL_TESTE:-}" ]; then
  docker exec "$CONTAINER" psql -U postgres -d tabloide -At -c "
    SELECT f.nome, l.nome_fantasia, a.status FROM filiais f
    JOIN lojistas l ON l.id = f.tenant_id JOIN lojista_ativacoes a ON a.lojista_id = l.id
    WHERE f.codigo_publico = '$CODIGO_FILIAL_TESTE' AND f.deleted_at IS NULL;"
fi

echo "==> Restauração concluída em $(( $(date +%s) - INICIO )) s (meta: < 1 h)"
