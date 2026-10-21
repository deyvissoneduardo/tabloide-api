---
id: 0006
title: Datas de vigência como DATEONLY e fuso por filial
status: accepted
date: 2026-10-21
tags: [data]
---

# 0006 - Datas de vigência como DATEONLY e fuso por filial

## Context

Panfletos e produtos têm vigência por dia (RN24), e filiais podem estar em fusos diferentes. "Hoje" depende do fuso da filial, não do servidor. Com `Date`/`timestamptz`, toda regra de vigência precisaria tratar fuso e a virada do dia.

## Decision

Datas de vigência são `DATEONLY` no banco e string `YYYY-MM-DD` (tipo `DataISO`) no TypeScript, comparadas lexicograficamente. "Hoje" é calculado por filial com `hojeNoFuso(fuso, ClockService.agora())`, usando o fuso IANA da filial.

## Consequences

**Pros:**
- O domínio de vigência é puro, sem fuso nem `Date`, e testável com strings.
- A virada do dia respeita a filial.

**Cons:**
- O tipo `DataISO` precisa ser respeitado em DTOs, views e consultas.
- Não há vigência com hora.

**Neutros:**
- O cache da página pública expira na meia-noite da filial (`segundosAteMeiaNoite`).

## Alternatives considered

- **`timestamptz` / `Date` no domínio** — Motivo da rejeição: obriga tratar fuso em toda regra e gera bugs na virada do dia.

## Applied in

- fase-2 (v1) — plans/fase-2-filiais-vigencia-auditoria.md
- fase-3 (v1) — plans/fase-3-midia-panfleto-identidade.md
- fase-4 (v1) — plans/fase-4-categorias-produtos.md
- fase-5 (v1) — plans/fase-5-pagina-publica-producao.md
