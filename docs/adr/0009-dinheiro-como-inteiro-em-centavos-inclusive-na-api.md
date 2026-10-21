---
id: 0009
title: Dinheiro como inteiro em centavos, inclusive na API
status: accepted
date: 2026-10-21
tags: [data, http]
---

# 0009 - Dinheiro como inteiro em centavos, inclusive na API

## Context

Produtos têm preço promocional e preço original, com regras de comparação (RN21) e teto. Valores monetários em ponto flutuante geram erros de arredondamento, e converter entre reais e centavos em várias camadas multiplica o risco.

## Decision

Dinheiro é sempre inteiro em centavos: `INTEGER` no banco, `number` inteiro no domínio e campos `*Centavos` no contrato HTTP (`precoPromocionalCentavos`). Quem formata é o front.

## Consequences

**Pros:**
- Sem erro de arredondamento, e comparações exatas no banco e no domínio.
- Nenhuma conversão dentro da API.

**Cons:**
- Todo cliente da API precisa converter para exibição.
- O teto é limitado pelo `INTEGER` (o teto de negócio é R$ 999.999,99).

**Neutros:**
- Helpers em `src/common/utils/money.ts`.

## Alternatives considered

- **`float` em reais** — Motivo da rejeição: erro de arredondamento de ponto flutuante.
- **`numeric` no banco com reais na API** — Motivo da rejeição: exige conversão e cuidado com decimais em cada camada.

## Applied in

- fase-4 (v1) — plans/fase-4-categorias-produtos.md
- fase-5 (v1) — plans/fase-5-pagina-publica-producao.md
