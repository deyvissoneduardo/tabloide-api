---
id: 0002
title: Camada View (presenters) e dependências de camada impostas por ESLint
status: accepted
date: 2026-10-21
tags: [architecture]
---

# 0002 - Camada View (presenters) e dependências de camada impostas por ESLint

## Context

Os models Sequelize carregam campos que não podem sair na resposta (`tenantId`, `deletedAt`, `senhaHash`, paths internos de mídia). O formato de resposta (centavos, datas `YYYY-MM-DD`, flags derivadas) também não deve ficar espalhado pelos controllers. Sem regra imposta, o acoplamento entre camadas cresce sem aviso.

## Decision

Cada módulo segue Model → Service → Controller, e toda resposta passa por uma função de `views/*.view.ts` que escolhe campo a campo o que é exposto. As dependências entre camadas são impostas por `no-restricted-imports` no `eslint.config.mjs`: controller não importa model, view não importa service nem sequelize, `domain/` não importa Nest nem Sequelize, service não importa controller.

## Consequences

**Pros:**
- Campo novo no model não vaza: precisa ser incluído na view de propósito.
- Regras puras em `domain/` são testadas sem mock.
- Violação de camada falha no lint do CI.

**Cons:**
- Cada entidade exige uma view e um tipo `XView` a mais.

**Neutros:**
- O padrão está descrito em `plans/00-visao-geral.md` (Arquitetura MVC).

## Alternatives considered

- **Serializar o model com `@Exclude`/`@Expose` do class-transformer** — Motivo da rejeição: a exposição é o padrão, e um campo novo esquecido sem `@Exclude` vaza (por exemplo `tenantId` ou `senhaHash`).
- **Regras de camada só em revisão de código** — Motivo da rejeição: sem verificação automática, a regra se degrada.

## Applied in

- fase-1 (v1) — plans/fase-1-fundacao-lojista-auth.md
- fase-2 (v1) — plans/fase-2-filiais-vigencia-auditoria.md
- fase-3 (v1) — plans/fase-3-midia-panfleto-identidade.md
- fase-4 (v1) — plans/fase-4-categorias-produtos.md
- fase-5 (v1) — plans/fase-5-pagina-publica-producao.md
