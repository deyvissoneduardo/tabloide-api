---
id: 0008
title: Constraints do banco como garantia final, traduzidas no filtro
status: accepted
date: 2026-10-21
tags: [data, validation, error-handling]
---

# 0008 - Constraints do banco como garantia final, traduzidas no filtro

## Context

Regras como e-mail único, panfletos sem sobreposição de período e preço original maior que o promocional são verificadas no service para dar mensagem amigável. Sob concorrência, duas requisições podem passar pela verificação ao mesmo tempo.

## Decision

As restrições do banco (CHECK, UNIQUE, EXCLUDE) duplicam as validações do service de propósito. Erros `23505`, `23P01` e `23514` são traduzidos centralmente em códigos de negócio por `traduzirErroPg` (`src/common/errors/pg-erros.ts`), pelo nome da constraint, sem try/catch no service.

## Consequences

**Pros:**
- A regra vale mesmo sob concorrência.
- A tradução fica num só lugar.

**Cons:**
- A regra existe em dois lugares (service e migration).
- Constraint nova com significado de negócio precisa ser registrada nos mapas de `pg-erros.ts`.

**Neutros:**
- Constraints seguem nomes previsíveis (`<tabela>_<desc>_ck`, `_uk`).

## Alternatives considered

- **Validar só no service** — Motivo da rejeição: falha sob concorrência.
- **Try/catch de erro do Postgres em cada service** — Motivo da rejeição: duplica a tradução e espalha códigos do Postgres pelo domínio.

## Applied in

- fase-1 (v1) — plans/fase-1-fundacao-lojista-auth.md
- fase-2 (v1) — plans/fase-2-filiais-vigencia-auditoria.md
- fase-3 (v1) — plans/fase-3-midia-panfleto-identidade.md
- fase-4 (v1) — plans/fase-4-categorias-produtos.md
