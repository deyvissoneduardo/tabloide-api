# Tabloide Digital API

> API do Tabloide Digital: lojistas publicam panfletos e produtos por filial numa página pública acessível por QR code.

## Sobre

Backend multi-tenant em NestJS. Cada lojista se cadastra, gerencia suas filiais e, em cada filial, cadastra panfletos, categorias e produtos com período de vigência. A API expõe:

- **Painel** (`/v1/painel/...`, autenticado por JWT): filiais e QR code, panfletos, categorias, produtos, identidade visual e auditoria.
- **Página pública** (`/v1/publico/filiais/:codigo`): o que está vigente na filial, com cache em memória.
- **Admin** (`/v1/admin/...`, header `X-Admin-Key`): redefinir senha de lojista e métricas.
- **Saúde** (`/v1/saude/vivo` e `/v1/saude/pronto`): liveness e readiness.

Os dados de um lojista nunca ficam visíveis para outro: toda consulta a tabela de lojista exige o `tenantId`, e há testes de vazamento entre lojistas para cada recurso.

## Arquitetura

- **NestJS 11 + TypeScript** (Node 22), organizado por módulo em `src/modules/` (controller → service → model, com `domain/` puro para as regras de negócio).
- **Postgres 16** com Sequelize 6; migrations em SQL em `src/database/migrations/`.
- **Mídia**: imagens processadas com `sharp` e gravadas em disco local (dev) ou no Supabase Storage (produção).
- **Produção**: Fly.io (região `gru`) + Supabase (banco e storage). Detalhes em [docs/operacao/runbook.md](docs/operacao/runbook.md).

## Pré-requisitos

- Node.js 22 (ver `.nvmrc`) e npm
- Docker (Postgres local e testes de integração)

## Como subir

```bash
npm ci
cp .env.example .env
npm run db:up        # Postgres 16 via docker compose
npm run db:migrate
npm run start:dev    # http://localhost:3000/v1
```

Confira se subiu:

```bash
curl http://localhost:3000/v1/saude/pronto
```

## Configuração

As variáveis são validadas na subida (`src/config/env.schema.ts`); a API não sobe com valor inválido. O [`.env.example`](.env.example) traz todas, com valores de desenvolvimento.

| Variável | Obrigatória | Default | Descrição |
|----------|-------------|---------|-----------|
| `DATABASE_URL` | sim | — | URL `postgres://` da aplicação |
| `DATABASE_URL_MIGRATIONS` | produção | — | Conexão direta (porta 5432) para migrations e `pg_dump` |
| `JWT_SECRET` | sim | — | Segredo do JWT do painel (mín. 32 caracteres) |
| `ADMIN_API_KEY` | sim | — | Chave das rotas `/v1/admin` (mín. 32 caracteres) |
| `PUBLIC_BASE_URL` | sim | — | URL do front da página pública, usada no QR code (sem `/` no final) |
| `STORAGE_DRIVER` | não | `disco` | `disco` em dev; `supabase` obrigatório em produção |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | com `supabase` | — | Acesso ao Supabase Storage (só no servidor) |
| `CORS_ORIGENS_PAINEL` | produção | — | Origens do painel, só `https://`, sem `*` |
| `PORT` | não | `3000` | Porta HTTP |
| `LOG_LEVEL` | não | `info` | `fatal` … `trace` |
| `SWAGGER_HABILITADO` | não | `false` | Expõe `/docs` (Swagger UI) e `/docs-json` (spec OpenAPI); manter `false` em produção |

Os demais (limites de taxa, cache da página pública, imagens, desligamento) têm default e estão no `.env.example`. Segredos de produção ficam em `fly secrets`, nunca no repositório.

## Endpoints / API

Com `SWAGGER_HABILITADO=true`, a documentação interativa fica em [`http://localhost:3000/docs`](http://localhost:3000/docs) e a spec OpenAPI 3 em `/docs-json`. Para testar rotas do painel, faça `POST /v1/auth/login` e cole o `token` em **Authorize**. As rotas `/v1/admin` ficam fora da documentação.

Exemplos prontos de requisição, por fase:

- [`http/`](http/) — arquivos `.http` (`fase-1.http` … `fase-5.http`) para o REST Client do VS Code / JetBrains.
- [`postman/`](postman/) — coleção e ambientes do Postman.

## Testes

```bash
npm test             # unitários
npm run test:cov     # unitários com gate de cobertura
npm run test:int     # integração (sobe Postgres via Testcontainers; precisa de Docker)
npm run lint
npm run typecheck
```

O teste de carga da página pública (k6) está descrito em [docs/operacao/carga.md](docs/operacao/carga.md).

## Contribuindo

1. Crie uma branch a partir da principal.
2. Rode `npm run lint`, `npm run typecheck`, `npm run test:cov` e `npm run test:int`; o CI roda os mesmos, além de validar que as migrations revertem.
3. Use commits no padrão Conventional Commits em pt-BR, ex.: `feat(produtos): adiciona busca por nome`.
4. Rota nova ganha exemplo no `http/fase-N.http` correspondente.

Depois do CI verde na branch principal, o deploy no Fly.io é automático (ver [runbook](docs/operacao/runbook.md)).

## Operação

- [Runbook de produção](docs/operacao/runbook.md)
- [Backup e restauração](docs/operacao/backup.md)
- [LGPD — dados de consumidores](docs/operacao/consumidores-lgpd.md)

## Licença

Proprietário — uso interno (`"license": "UNLICENSED"` no `package.json`).
