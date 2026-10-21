---
id: 0014
title: Testes de integração com Postgres real e cenários de vazamento obrigatórios
status: accepted
date: 2026-10-21
tags: [testing]
---

# 0014 - Testes de integração com Postgres real e cenários de vazamento obrigatórios

## Context

Várias regras dependem do Postgres: EXCLUDE com GiST, `citext`, índices parciais, triggers e a tradução de erros de constraint (ADR-0008). O isolamento entre lojistas (ADR-0001) é o requisito mais crítico do sistema e precisa ser provado de ponta a ponta.

## Decision

Os testes de integração (`test/**/*.int-spec.ts`) rodam contra Postgres 16 real via Testcontainers, com as migrations aplicadas. Todo recurso com tenant ganha cenários de vazamento com `descreverVazamentoEntreTenants` (`test/helpers/vazamento.ts`): o lojista A tenta ler, editar e excluir recursos de B e recebe 404.

## Consequences

**Pros:**
- Testa o comportamento real do banco e as migrations.
- Uma regressão de isolamento quebra o CI.

**Cons:**
- Precisa de Docker local e no CI, e a suíte é mais lenta (`--runInBand`).

**Neutros:**
- Tabela nova precisa entrar em `TABELAS` (`test/helpers/banco-de-teste.ts`).

## Alternatives considered

- **SQLite em memória / mocks de banco** — Motivo da rejeição: não cobrem EXCLUDE GiST, `citext` nem os hooks de tenant contra o banco real.

## Applied in

- fase-1 (v1) — plans/fase-1-fundacao-lojista-auth.md
- fase-2 (v1) — plans/fase-2-filiais-vigencia-auditoria.md
- fase-3 (v1) — plans/fase-3-midia-panfleto-identidade.md
- fase-4 (v1) — plans/fase-4-categorias-produtos.md
- fase-5 (v1) — plans/fase-5-pagina-publica-producao.md
