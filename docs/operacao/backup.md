# Backup e restauração (RNF08)

## Camadas

| Camada | O quê | Frequência | Retenção | Onde |
| --- | --- | --- | --- | --- |
| 1. Supabase (nativo) | Backup físico gerenciado (+ PITR, se contratado) | diário | a do plano (ex.: 7 dias) | Supabase |
| 2. Própria | `pg_dump -Fc --no-owner`, criptografado com `age` | diário, 03:00 BRT | **30 dias** (regra de ciclo de vida no bucket) | Bucket S3-compatível fora do Supabase |
| 2b. Mídia | `rclone sync` do bucket `midia`, com versões em `midia-versoes/<data>` | diário | 30 dias de versões | Mesmo bucket da camada 2 |

A camada 2 roda em `.github/workflows/api-backup.yml` e usa a porta 5432 (`DATABASE_URL_MIGRATIONS`), porque o `pg_dump` não funciona no transaction pooler.

Secrets do workflow: `DATABASE_URL_MIGRATIONS`, `BACKUP_AGE_PUBLIC_KEY`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY`. A falha do workflow gera o e-mail padrão do GitHub para o administrador.

**A chave privada do `age` nunca vai para o CI.** Ela fica com o administrador (gerenciador de senhas + cópia offline). Sem ela, os backups não podem ser lidos.

Regra de ciclo de vida no bucket: expirar objetos de `db/` e `midia-versoes/` com mais de 30 dias.

## Teste de restauração

Mensal, no primeiro domingo, e antes do go-live.

```bash
BACKUP_S3_ENDPOINT=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
BACKUP_AGE_IDENTITY=~/.config/tabloide/backup.key CODIGO_FILIAL_TESTE=<codigo> \
scripts/restaurar-backup.sh            # ou: scripts/restaurar-backup.sh 2026/11/01
```

O script baixa e descriptografa o dump, restaura num Postgres 16 descartável, confere se as migrations estão em dia, roda as consultas de sanidade (lojistas, filiais e produtos ativos, filial de teste) e informa a duração.

Metas: restauração completa em menos de 1 h (RTO); perda máxima de 24 h pela camada 2 (RPO). O PITR, se contratado, reduz o RPO.

## Registro dos testes

| Data | Backup restaurado | Duração | Resultado | Responsável |
| --- | --- | --- | --- | --- |
| | | | | |
