---
id: 0005
title: Transação explícita por parâmetro, sem Sequelize.useCLS
status: accepted
date: 2026-10-21
tags: [data]
---

# 0005 - Transação explícita por parâmetro, sem Sequelize.useCLS

## Context

Muitas escritas tocam várias linhas e gravam auditoria. O projeto já usa `nestjs-cls` para `tenantId` e `requestId`, então seria natural esperar que a transação também viajasse pelo CLS. Uma transação implícita, porém, esconde quais chamadas estão dentro dela.

## Decision

Toda escrita que toca mais de uma linha ou grava auditoria usa `sequelize.transaction()` gerenciada e passa `{ transaction }` explicitamente para cada chamada. `Sequelize.useCLS` não é usado.

## Consequences

**Pros:**
- Lendo o código, fica claro o que está dentro da transação.
- Testes unitários usam uma transação falsa (`test/helpers/transacao-fake.ts`) sem CLS.

**Cons:**
- Assinaturas de service e auditoria carregam o parâmetro `transaction`.
- Esquecer o `{ transaction }` numa chamada a executa fora da transação.

**Neutros:**
- O `nestjs-cls` continua em uso para `tenantId` e `requestId`.

## Alternatives considered

- **`Sequelize.useCLS`** — transação propagada automaticamente. Motivo da rejeição: esconde onde a transação vale e dificulta testar.

## Applied in

- fase-1 (v1) — plans/fase-1-fundacao-lojista-auth.md
- fase-2 (v1) — plans/fase-2-filiais-vigencia-auditoria.md
- fase-3 (v1) — plans/fase-3-midia-panfleto-identidade.md
- fase-4 (v1) — plans/fase-4-categorias-produtos.md
- fase-5 (v1) — plans/fase-5-pagina-publica-producao.md
