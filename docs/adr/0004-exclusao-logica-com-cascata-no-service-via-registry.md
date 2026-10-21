---
id: 0004
title: Exclusão lógica com cascata no service via registry
status: accepted
date: 2026-10-21
tags: [data, architecture]
---

# 0004 - Exclusão lógica com cascata no service via registry

## Context

Toda exclusão é lógica (RN25): o histórico e a auditoria precisam continuar consultáveis. Excluir uma filial precisa excluir seus produtos, categorias e panfletos, em ordem e na mesma transação. O módulo de filiais não deve conhecer os módulos que dependem dele.

## Decision

Models de tenant usam `paranoid: true` (`deleted_at`). A cascata é feita no service, em transação, por handlers que implementam `ExclusaoEmCascataFilial` e se registram no `ExclusaoEmCascataFilialRegistry` em `onModuleInit`, com `ordem` explícita (produtos 10, categorias 20, panfletos 30).

## Consequences

**Pros:**
- Nada é apagado fisicamente, e o histórico continua consultável.
- Módulo novo entra na cascata sem alterar o módulo de filiais.

**Cons:**
- Toda consulta depende do escopo `paranoid` e de índices parciais `WHERE deleted_at IS NULL`.
- Esquecer de registrar um handler deixa filhos "vivos" de uma filial excluída.

**Neutros:**
- A eliminação física de dados de consumidores (LGPD) será a única exceção prevista.

## Alternatives considered

- **`ON DELETE CASCADE` físico nas FKs** — Motivo da rejeição: não dispara em soft delete e apagaria o histórico, contrariando RN25.
- **Cascata chamada diretamente pelo service de filiais** — Motivo da rejeição: acopla filiais a todos os módulos dependentes, e a ordem fica implícita.

## Applied in

- fase-2 (v1) — plans/fase-2-filiais-vigencia-auditoria.md
- fase-3 (v1) — plans/fase-3-midia-panfleto-identidade.md
- fase-4 (v1) — plans/fase-4-categorias-produtos.md
