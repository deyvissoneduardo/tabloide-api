---
id: 0011
title: Storage de mídia atrás de StoragePort, sem remoção
status: accepted
date: 2026-10-21
tags: [architecture]
---

# 0011 - Storage de mídia atrás de StoragePort, sem remoção

## Context

Panfletos, fotos de produto e logos são imagens. Em produção ficam no Supabase Storage, mas o desenvolvimento e os testes não devem depender de serviço externo. A gravação da imagem acontece fora da transação do banco, então uma falha na transação pode deixar arquivo sem referência, e apagar o arquivo antigo pode quebrar uma referência viva.

## Decision

O armazenamento fica atrás de `StoragePort`, com adapter de disco em dev e de Supabase em produção (`STORAGE_DRIVER`). Arquivos nunca são sobrescritos nem apagados: a imagem é processada antes da transação, e o arquivo órfão é só logado (`midia.arquivo_orfao`).

## Consequences

**Pros:**
- Dev e testes funcionam sem rede.
- Nenhuma referência aponta para arquivo apagado.

**Cons:**
- O storage acumula arquivos órfãos e versões antigas.

**Neutros:**
- O backup copia o bucket com versões (`api-backup.yml`).

## Alternatives considered

- **Supabase Storage também em dev** — Motivo da rejeição: dependência externa no desenvolvimento e nos testes.
- **Apagar a imagem antiga na troca** — Motivo da rejeição: se a transação falhar depois, a referência fica quebrada.

## Applied in

- fase-3 (v1) — plans/fase-3-midia-panfleto-identidade.md
- fase-4 (v1) — plans/fase-4-categorias-produtos.md
- fase-5 (v1) — plans/fase-5-pagina-publica-producao.md
