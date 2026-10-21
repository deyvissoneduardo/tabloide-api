---
id: 0010
title: IDs UUID v7 gerados na aplicação
status: accepted
date: 2026-10-21
tags: [data, security]
---

# 0010 - IDs UUID v7 gerados na aplicação

## Context

IDs aparecem em URLs do painel e não podem ser enumeráveis (RNF05). As tabelas principais são consultadas por índice B-tree, e IDs totalmente aleatórios fragmentam o índice.

## Decision

Toda PK é `uuid` versão 7, gerada no service com `v7()` da lib `uuid` antes do insert.

## Consequences

**Pros:**
- IDs não sequenciais e ordenáveis no tempo, o que é bom para índices B-tree.
- O ID é conhecido antes do insert (útil em auditoria e eventos).

**Cons:**
- O service precisa lembrar de gerar o ID.

**Neutros:**
- O código público da filial é outro identificador (nanoid de 8 caracteres), não o UUID.

## Alternatives considered

- **`serial`/`bigint` autoincremento** — Motivo da rejeição: sequencial e enumerável (RNF05).
- **UUID v4 / `gen_random_uuid()`** — Motivo da rejeição: não ordenável, pior para B-tree.

## Applied in

- fase-1 (v1) — plans/fase-1-fundacao-lojista-auth.md
- fase-2 (v1) — plans/fase-2-filiais-vigencia-auditoria.md
- fase-3 (v1) — plans/fase-3-midia-panfleto-identidade.md
- fase-4 (v1) — plans/fase-4-categorias-produtos.md
