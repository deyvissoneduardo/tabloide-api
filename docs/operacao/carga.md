# Teste de carga da página pública (Fase 5, seção 10.14)

Como rodar: instruções no topo de `test/carga/pagina-publica.k6.js`. Não roda no CI; repetir antes do go-live e a cada mudança nas consultas públicas, anexando o resultado ao PR.

## Rodada de 2026-10-19 (ambiente local)

Ambiente: `docker-compose.carga.yml` num notebook (Docker Desktop): API com 1 vCPU e 512 MB, Postgres 16 com 1 vCPU. Seed `npm run seed:carga`: 50 lojistas ativos, 100 filiais, 300 produtos por filial em 15 categorias e 1 panfleto vigente. O k6 rodou num container na mesma rede do compose, disputando a mesma VM.

| Rodada | Configuração | Meta | Resultado |
| --- | --- | --- | --- |
| Quente | cache ligado, 500 req/s por 2 min, 99 códigos | p95 < 50 ms, p99 < 150 ms, erro < 0,1% | **p95 29,9 ms**, p99 dentro, 0 erros em 59.905 requisições (499 req/s) ✅ |
| Fria | `PUBLICO_CACHE_DESATIVADO=true`, 100 req/s por 2 min | p95 < 200 ms | **p95 18,3 ms**, 0 erros em 11.967 requisições ✅ |
| Fila na porta | 1 código com cache vazio, 200 VUs com 1 requisição cada, todos juntos | 1 carga no banco; p95 < 50 ms | **1 carga no banco** (`publico_cache_total{resultado="miss"}` = 1, 199 hits) ✅; **p95 292 ms** ❌ (ver abaixo) |
| Payload | página de 300 produtos | JSON ≤ 30 KB com gzip | 35 KB sem compressão, **2,6 KB com gzip** ✅ |
| Rate limit | 1 IP acima de 300/min | 429 sem afetar os demais | coberto pelo teste de integração `test/integration/publico/producao.int-spec.ts` ✅ |

### Sobre a fila

Uma carga fria isolada (3 consultas, montagem de 300 produtos, JSON e gzip) leva 10–16 ms com o processo aquecido, e um hit leva 5–9 ms. O tempo da fila vem de abrir 200 conexões TCP e devolver 200 respostas ao mesmo tempo num único vCPU, com o próprio k6 na mesma VM: o mínimo da rodada já foi 98 ms. Repetir em ambiente separado (k6 fora da máquina da API, ex.: staging no Fly) antes de concluir se a meta é atingível; se não for, a revisão da meta fica com o produto.

### Otimização feita durante a rodada

Na primeira rodada quente o p95 foi 514 ms e a API não sustentava 500 req/s: com a página em cache, o middleware de compressão ainda refazia o gzip dos 35 KB **a cada requisição**. Agora a página é comprimida uma vez por carga e guardada no cache (`corpoGzip`); o controller envia o buffer pronto quando o cliente aceita gzip.
