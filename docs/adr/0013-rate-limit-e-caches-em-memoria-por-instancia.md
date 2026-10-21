---
id: 0013
title: Rate limit e caches em memória por instância
status: accepted
date: 2026-10-21
tags: [performance, security]
---

# 0013 - Rate limit e caches em memória por instância

## Context

A API roda em 2 máquinas no Fly.io e precisa de rate limit (login, cadastro, admin, página pública), cache do status do lojista e cache da página pública. Um armazenamento compartilhado acrescentaria uma peça de infraestrutura a operar.

## Decision

O rate limit (`@nestjs/throttler`) e os caches (status do lojista, página pública) ficam em memória, com LRU, em cada instância. Não há armazenamento compartilhado entre as máquinas.

## Consequences

**Pros:**
- Nenhuma infraestrutura extra, e latência mínima.

**Cons:**
- O limite efetivo é N × o configurado (N = número de máquinas).
- Desativar um lojista leva até cerca de 90 s para tirar a página do ar.
- Os caches são perdidos a cada deploy.

**Neutros:**
- Os tempos de propagação estão documentados em `docs/operacao/runbook.md`.

## Alternatives considered

- **Redis compartilhado** — Motivo da rejeição: mais uma peça de infraestrutura para operar e pagar, sem necessidade no volume do MVP.

## Applied in

- fase-1 (v1) — plans/fase-1-fundacao-lojista-auth.md
- fase-5 (v1) — plans/fase-5-pagina-publica-producao.md
