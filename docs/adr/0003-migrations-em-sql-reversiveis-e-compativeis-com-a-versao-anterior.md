---
id: 0003
title: Migrations em SQL, reversíveis e compatíveis com a versão anterior
status: accepted
date: 2026-10-21
tags: [data, build]
---

# 0003 - Migrations em SQL, reversíveis e compatíveis com a versão anterior

## Context

O schema usa recursos do Postgres que o Sequelize não modela bem (EXCLUDE com GiST, índices parciais, `citext`, triggers). O deploy é rolling com 2 máquinas: por um tempo, a versão antiga do código roda sobre o schema novo. O rollback do deploy troca a imagem, mas não desfaz migrations.

## Decision

Migrations são arquivos JS do `sequelize-cli` em `src/database/migrations/`, com DDL em SQL cru e `up`/`down`; `sync()` nunca é usado fora de teste. O CI roda up → undo:all → up, e toda migration é compatível com a versão anterior do código (expandir → migrar dados → contrair, em deploys separados).

## Consequences

**Pros:**
- Schema versionado e revisável em SQL, com acesso a todos os recursos do Postgres.
- Rollback de imagem é seguro, porque o código anterior funciona com o schema novo.

**Cons:**
- Renomear ou remover coluna exige pelo menos dois deploys.
- O `down` precisa ser escrito e mantido à mão.

**Neutros:**
- Migrations destrutivas rodam na janela de manutenção (ver `docs/operacao/runbook.md`).
- A migration de extensões tem `down` vazio de propósito (extensões podem ser usadas por outras bases).

## Alternatives considered

- **`sequelize.sync()`** — Motivo da rejeição: sem versionamento nem revisão do DDL, e sem suporte aos recursos específicos do Postgres.
- **Migrations sem `down` e rollback que reverte o schema** — Motivo da rejeição: o rollback de imagem não desfaz migrations, então a compatibilidade com o código anterior é o que garante o rollback.

## Applied in

- fase-1 (v1) — plans/fase-1-fundacao-lojista-auth.md
- fase-2 (v1) — plans/fase-2-filiais-vigencia-auditoria.md
- fase-3 (v1) — plans/fase-3-midia-panfleto-identidade.md
- fase-4 (v1) — plans/fase-4-categorias-produtos.md
- fase-5 (v1) — plans/fase-5-pagina-publica-producao.md
