---
id: 0001
title: Isolamento multi-tenant em três camadas com trava no ORM
status: accepted
date: 2026-10-21
tags: [security, data, architecture]
---

# 0001 - Isolamento multi-tenant em três camadas com trava no ORM

## Context

Todos os lojistas compartilham as mesmas tabelas. Um único `where` sem `tenantId` vaza dados de um lojista para outro (RN07, RNF04). Confiar só na disciplina de cada service não basta: o esquecimento é silencioso e passa em teste unitário.

## Decision

O `tenantId` vem só do JWT e é o primeiro parâmetro de todo service do painel. Models `@TenantScoped()` têm hooks globais que lançam `TenantScopeViolationError` em consulta ou escrita sem `tenantId` no `where`; só o módulo `publico` usa `skipTenantScope`. Recurso de outro lojista responde 404, nunca 403.

## Consequences

**Pros:**
- Esquecer o filtro quebra em teste e em runtime, em vez de vazar dados.
- O 404 não revela a existência de recursos de outro lojista.

**Cons:**
- `findByPk` não pode ser usado; toda busca precisa de `findOne({ where: { id, tenantId } })`.
- Consultas legítimas entre tenants exigem a exceção explícita `skipTenantScope`.

**Neutros:**
- Todo recurso com tenant precisa de cenários de vazamento nos testes de integração (ver ADR-0014).

## Alternatives considered

- **Row Level Security do Postgres** — políticas por `tenant_id` com variável de sessão. Motivo da rejeição: a API usa o transaction pooler do Supabase (porta 6543), em que a variável de sessão por requisição é frágil.
- **Schema por tenant** — um schema Postgres por lojista. Motivo da rejeição: cada migration teria de rodar N vezes, e a operação fica cara para um MVP.

## Applied in

- fase-1 (v1) — plans/fase-1-fundacao-lojista-auth.md
- fase-2 (v1) — plans/fase-2-filiais-vigencia-auditoria.md
- fase-3 (v1) — plans/fase-3-midia-panfleto-identidade.md
- fase-4 (v1) — plans/fase-4-categorias-produtos.md
- fase-5 (v1) — plans/fase-5-pagina-publica-producao.md
