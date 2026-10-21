---
id: 0012
title: JWT HS256 de 8 h sem refresh token
status: accepted
date: 2026-10-21
tags: [auth, security]
---

# 0012 - JWT HS256 de 8 h sem refresh token

## Context

Cada lojista tem um único login (RN05) e usa o painel em sessões de trabalho. O MVP precisa de autenticação simples, mas que proteja o `tenantId`, porque é do token que ele vem (ver ADR-0001).

## Decision

A autenticação usa um access token JWT HS256 com expiração de 8 h, sem refresh token. Trocar a senha não invalida tokens já emitidos: é um risco aceito no MVP.

## Consequences

**Pros:**
- Nenhum estado de sessão no servidor.
- Implementação simples com `@nestjs/jwt`.

**Cons:**
- Token vazado vale até expirar, mesmo depois de trocar a senha.
- O lojista precisa logar de novo a cada 8 h.

**Neutros:**
- O status do lojista (desativado) é verificado por requisição pelo `TenantStatusGuard`, independentemente do token.

## Alternatives considered

- **Refresh token / sessão no banco com revogação** — Motivo da rejeição: complexidade a mais (armazenamento, rotação, revogação) sem necessidade no MVP.

## Applied in

- fase-1 (v1) — plans/fase-1-fundacao-lojista-auth.md
