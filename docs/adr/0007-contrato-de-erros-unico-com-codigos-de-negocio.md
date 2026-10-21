---
id: 0007
title: Contrato de erros único com códigos de negócio
status: accepted
date: 2026-10-21
tags: [error-handling, http]
---

# 0007 - Contrato de erros único com códigos de negócio

## Context

O painel e a página pública precisam distinguir erros de negócio (período sobreposto, categoria com produtos ativos, limite do plano) e exibir mensagens em pt-BR. Só o status HTTP não basta: vários erros compartilham o 409. Os erros também não podem vazar detalhes internos.

## Decision

Todo erro sai no formato `{ erro: { codigo, mensagem, detalhes } }` pelo `AppExceptionFilter`. Erros de negócio são `new AppError(CodigoErro.X)`, com status e mensagem centralizados em `STATUS_POR_CODIGO` e `MENSAGEM_POR_CODIGO` (`src/common/errors/codigos-erro.ts`).

## Consequences

**Pros:**
- O front trata por `codigo`, estável entre versões.
- Mensagens e status ficam num só lugar, e erros inesperados viram `ERRO_INTERNO` sem detalhes.

**Cons:**
- Código novo exige entrada nos três mapas.

**Neutros:**
- O catálogo de códigos está em `plans/00-visao-geral.md` (Contrato de erros).

## Alternatives considered

- **Corpo padrão do `HttpException` do Nest** — Motivo da rejeição: sem código estável para o front tratar, e com mensagens em inglês e formato variável.

## Applied in

- fase-1 (v1) — plans/fase-1-fundacao-lojista-auth.md
- fase-2 (v1) — plans/fase-2-filiais-vigencia-auditoria.md
- fase-3 (v1) — plans/fase-3-midia-panfleto-identidade.md
- fase-4 (v1) — plans/fase-4-categorias-produtos.md
- fase-5 (v1) — plans/fase-5-pagina-publica-producao.md
