# Runbook de operação — Tabloide Digital API

Procedimentos do administrador em produção. Referência técnica: `plans/fase-5-pagina-publica-producao.md`, seção 11.

## Ambiente

| Peça | Onde | Observação |
| --- | --- | --- |
| API | Fly.io, região `gru`, 2 máquinas `shared-cpu-1x` 512 MB (`fly.toml`) | Deploy rolling, readiness em `/v1/saude/pronto` |
| Banco | Supabase, região `sa-east-1` | API no transaction pooler (6543); migrations e `pg_dump` na porta 5432 |
| Mídia | Supabase Storage, bucket `midia` | Leitura pública, escrita só com a `service_role` (servidor) |
| Backup próprio | Bucket S3-compatível fora do Supabase (ex.: Cloudflare R2) | Ver [backup.md](backup.md) |

Janela de manutenção: **02:00–05:00 (America/Sao_Paulo)**, todos os dias. Migrations destrutivas e manutenção do Supabase ficam nela.

## Ativar e desativar lojista (RN03, RN35)

Direto no banco (não há rota). Comandos de referência em `src/database/admin-ativacao.sql`.

```sql
UPDATE lojista_ativacoes SET status = 'ATIVO', observacao = 'contrato assinado em ...' WHERE lojista_id = '<uuid>';
UPDATE lojista_ativacoes SET status = 'DESATIVADO', observacao = 'inadimplência desde ...' WHERE lojista_id = '<uuid>';
```

Quando vale:

- **Painel**: até `TENANT_STATUS_CACHE_TTL_MS` (30 s).
- **Página pública**: até 60 s no cache do servidor, mais até 30 s no navegador que já tinha a página e uma exibição desatualizada durante a revalidação. Total ≤ 90 s mais uma visualização.
- **Recém-ativado**: aparece em até 10 s (cache negativo).

## Redefinir senha (RN36)

`PATCH /v1/admin/lojistas/:id/senha` com o header `X-Admin-Key` e `{ "novaSenha": "..." }` (coleção `http/fase-1.http`). Sem a chave, a rota responde 404. Limite de 10 requisições por minuto.

## Configurar limites (RNF12)

Sem linha na tabela ou com coluna `NULL`, não há limite.

```sql
INSERT INTO lojista_limites (lojista_id, max_filiais, max_produtos_por_filial, max_imagem_bytes)
VALUES ('<uuid>', 3, 500, 5242880)
ON CONFLICT (lojista_id) DO UPDATE
  SET max_filiais = EXCLUDED.max_filiais,
      max_produtos_por_filial = EXCLUDED.max_produtos_por_filial,
      max_imagem_bytes = EXCLUDED.max_imagem_bytes,
      updated_at = now();
```

- Os limites de filiais e produtos valem na hora; o de imagem, em até 30 s (cache por lojista).
- Produtos vencidos que não foram excluídos contam no limite. O lojista pode excluí-los para liberar espaço.
- Acima do limite, a criação responde 409 `LIMITE_DO_PLANO_ATINGIDO` com `detalhes: { recurso, limite }`.

## Deploy e rollback

O deploy é automático depois do CI verde na branch principal (`.github/workflows/api-deploy.yml`):

1. Build e push da imagem com a tag do SHA.
2. `npm run db:migrate` com `DATABASE_URL_MIGRATIONS` (porta 5432).
3. Deploy rolling.
4. Smoke test: `/v1/saude/pronto` e a página pública da filial de teste (`vars.CODIGO_FILIAL_TESTE`).
5. Se o smoke falhar, volta para a imagem anterior.

**Migrations não são revertidas automaticamente.** Por isso toda migration precisa ser compatível com a versão anterior do código: expandir → migrar dados → contrair, em deploys separados.

Rollback manual:

```bash
fly releases --image          # localizar a imagem anterior
fly deploy --image registry.fly.io/tabloide-api:<sha-anterior> --strategy rolling
```

## Monitoramento

- Monitor externo (UptimeRobot ou Better Stack) a cada 1 min em `/v1/saude/pronto` e na página pública de teste, com alerta por WhatsApp/e-mail.
- Métricas Prometheus em `GET /v1/admin/metricas` com `X-Admin-Key`: `http_request_duration_seconds`, `publico_cache_total{resultado}`, `publico_cache_entradas`, `db_pool_em_uso`, `db_pool_espera` e as padrão do processo.
- Logs em JSON (pino) com `requestId` em todas as linhas; `Authorization`, `X-Admin-Key`, `Cookie`, senhas e `Set-Cookie` são omitidos. Página pública: só erros e 1% das respostas boas.

## Configuração do Supabase

| Item | Como |
| --- | --- |
| Extensões | `citext` e `btree_gist`, criadas pelas migrations. Conferir em *Database → Extensions* |
| Role da API | `tabloide_api`, com `GRANT` só nas tabelas de `public`, sem acesso a `auth`/`storage`. Migrations rodam com o role dono |
| PostgREST | Remover `public` de *Exposed schemas* **ou** ligar RLS sem políticas em todas as tabelas. Testar com a chave `anon`: não pode ler nada |
| Bucket `midia` | Público para leitura; nenhuma política de escrita para `anon`/`authenticated`; limite de 5 MB por arquivo; MIME permitido `image/webp` |
| Backup nativo | Conferir retenção e PITR do plano contratado (em geral 7 dias no Pro); a camada própria cobre os 30 dias |

## Variáveis de ambiente de produção

Validadas pelo `zod` na subida (`src/config/env.schema.ts`). Obrigatórias além das das fases anteriores: `TRUST_PROXY`, `CORS_ORIGENS_PAINEL` (só `https://`, sem `*`), `DATABASE_URL` (pooler 6543), `DATABASE_URL_MIGRATIONS` (5432, só no CI), `DB_SSL=true`, `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

`JWT_SECRET` e `ADMIN_API_KEY` com pelo menos 32 bytes aleatórios, diferentes dos de dev, guardados só em `fly secrets` e nos secrets do GitHub.

## Checklist de go-live

**Supabase**
- [ ] Projeto em `sa-east-1` e plano com backup diário ativo (retenção e PITR conferidos).
- [ ] Extensões `citext` e `btree_gist` habilitadas.
- [ ] Role `tabloide_api` com privilégios mínimos; `DATABASE_URL` no pooler 6543 e `DATABASE_URL_MIGRATIONS` na 5432, ambos com SSL.
- [ ] Schema `public` fora do PostgREST ou RLS sem políticas; teste com a chave `anon` retornando nada.
- [ ] Bucket `midia` público para leitura, sem escrita para `anon`/`authenticated`, limite de tamanho e MIME `image/webp`.

**API**
- [ ] 2 máquinas em `gru`, readiness no health check e deploy rolling.
- [ ] Variáveis de produção definidas; `CORS_ORIGENS_PAINEL` só com HTTPS.
- [ ] `JWT_SECRET` e `ADMIN_API_KEY` novos e só nos secrets.
- [ ] TLS válido no domínio da API; HSTS ativo.
- [ ] `TRUST_PROXY` conferido: o IP real aparece nos logs.

**Operação**
- [ ] Monitor externo a cada 1 min com alerta.
- [ ] Primeiro backup próprio concluído **e restaurado** com `scripts/restaurar-backup.sh`.
- [ ] Teste de carga (`test/carga/pagina-publica.k6.js`) executado e resultado anexado ao PR.
- [ ] Janela de manutenção comunicada.
- [ ] Teste real: QR Code impresso, celular em 4G, carregamento ≤ 3 s, zoom no panfleto e "válido até dd/mm"; desativar o lojista e conferir que a página some em ≤ 90 s.
- [ ] Pendências jurídicas registradas: RNF07 (CDC) e, para a versão futura, RNF11 (LGPD).
