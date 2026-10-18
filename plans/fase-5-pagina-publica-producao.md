# Fase 5 — Página pública, limites e produção

Base: [`00-visao-geral.md`](./00-visao-geral.md). Stack, MVC, convenções, contrato de erros, estratégia BDD e critério de pronto vêm de lá e não são repetidos aqui.

Regras cobertas: RN23, RN27–RN32, RN35, RN41 (página pública); RNF12 (limites); RNF02, RNF03, RNF05, RNF08 (produção). Também documenta, sem implementar, a preparação para RN33, RN34 e RNF11.

---

## 1. Objetivo

Entregar o que o consumidor vê ao ler o QR Code: um endpoint público, sem autenticação, que devolve em **uma** resposta JSON pequena e cacheável tudo o que a página precisa (identidade do lojista, filial, panfleto vigente e produtos vigentes por categoria). A meta é p95 < 50 ms com cache quente e < 200 ms frio no servidor, para que a página carregue em até 3 s numa rede 4G fraca (RNF02).

Também deixa a API pronta para produção: limites por lojista (RNF12), hardening HTTP, observabilidade, deploy no Supabase, CI, disponibilidade (RNF03) e backup (RNF08).

## 2. Escopo

**Dentro**

- (A) `GET /v1/publico/filiais/:codigo`, com cache em memória, ETag/304, `Cache-Control` e rate limit próprio.
- (B) Tabela `lojista_limites` e `LimitesService`, ligados aos pontos de criação das Fases 2–4.
- (C) Hardening (helmet, CORS, compression, trust proxy, limites de body, timeouts, graceful shutdown), health check, logs com redaction, métricas, Dockerfile, deploy (API + Supabase), pipeline de CI, disponibilidade, backup e teste de restauração.
- Documentação da preparação para a base de consumidores e nota sobre LGPD.

**Fora**

- Renderização HTML da página pública (é do front-end; a API só entrega JSON).
- Cadastro de consumidores (RN33/RN34/RNF11): só documentado na seção 12.
- Valores padrão dos limites (RNF12): continuam em aberto. Sem linha na tabela, não há limite.
- CDN/proxy de cache na frente da API: opcional, descrito como evolução na seção 7.5.

## 3. Pré-requisitos (Fases 1–4 concluídas)

| Item | Origem | Uso nesta fase |
| --- | --- | --- |
| `lojistas`, `lojista_ativacoes.status` | Fase 1 | Identidade visual e regra de status (RN35) |
| Hooks `@TenantScoped` + opção `{ skipTenantScope: true }` | Fase 1 | Única consulta sem tenant: localizar a filial pelo código |
| `AdminKeyGuard`, `AppExceptionFilter`, `ClockService`, `TenantContext` (CLS com `requestId`) | Fase 1 | Métricas protegidas, contrato de erro, relógio fixo nos testes, logs |
| Throttler do login | Fase 1 | Reaproveitado com um throttler nomeado `publico` |
| `filiais.codigo_publico` (UNIQUE), `filiais.fuso_horario` | Fase 2 | Chave de busca e cálculo de "hoje" |
| `hojeNoFuso(fuso, agora)`, `calcularSituacao` | Fase 2 | Vigência (RN23, RN24) |
| Token `VERIFICADOR_LIMITES` / interface `VerificadorLimites` (`verificarCriacaoFilial`, `verificarCriacaoProduto`, `maxImagemBytes`) com o no-op `SemLimitesVerificador` no `LimitesModule` global | Fase 2 (contrato), consumido nas Fases 2–4 | Substituído pelo `LimitesService` (seção 9) |
| `EVENTO_CONTEUDO_ALTERADO` (`'filial.conteudo-alterado'`), `ConteudoAlteradoEvento { tenantId, filialId? }` e `EventEmitterModule.forRoot()` | Fase 2 (contrato), emitido após o commit nas Fases 2–4 | Consumido pelo cache (seção 7.3) |
| `panfletos` + `EXCLUDE USING gist (...)` (índice `panfletos_periodo_sem_sobreposicao`) | Fase 3 | Busca do panfleto vigente usa o mesmo índice GiST |
| `StoragePort.urlPublica(path)` | Fase 3 | URLs de imagem na resposta |
| `categorias`, `produtos` + índice `produtos_filial_ativos_idx (tenant_id, filial_id, data_inicio) WHERE deleted_at IS NULL` | Fase 4 | Busca de produtos vigentes |

> Os pontos de chamada de limites (seção 9.4) e de emissão do evento (seção 7.3) já existem desde as Fases 2–4. Esta fase só troca o provider de `VERIFICADOR_LIMITES` e adiciona o consumidor do evento. Se algum ponto estiver faltando, ele é adicionado aqui, com seu teste.

## 4. Novas dependências

| Pacote | Uso |
| --- | --- |
| `lru-cache` | Cache em memória da página pública |
| `@nestjs/event-emitter` | Já instalado na Fase 2; aqui só o consumidor `@OnEvent(EVENTO_CONTEUDO_ALTERADO)` |
| `helmet`, `compression` | Hardening e gzip/brotli |
| `@nestjs/terminus` | Health check |
| `prom-client` | Métricas |
| `k6` (binário, fora do `package.json`) e `autocannon` (dev) | Teste de carga |

## 5. Passo a passo (ordem de execução)

| # | Passo | Arquivos |
| --- | --- | --- |
| 1 | Migration `lojista_limites` | `src/database/migrations/20261101000000-criar-lojista-limites.js` |
| 2 | Model e `LimitesService`, troca do provider de `VERIFICADOR_LIMITES` (sai `SemLimitesVerificador`) | `src/modules/limites/**`, `src/common/limites/limites.module.ts` |
| 3 | Util `segundosAteMeiaNoite` + testes | `src/common/utils/date-only.ts` |
| 4 | Reusar `compararTextoPtBr`/`collatorPtBr` da Fase 1 (cenários extras de RN30 na seção 10.2) | `src/common/utils/text.ts` |
| 5 | Consultas da página pública | `src/modules/publico/services/pagina-publica.query.ts` |
| 6 | Montagem (agrupar, filtrar, ordenar) como função pura | `src/modules/publico/domain/montar-pagina.ts` |
| 7 | View pública | `src/modules/publico/views/pagina-publica.view.ts` |
| 8 | Cache (LRU, geração, single-flight, negativo, índices por tenant/filial) | `src/modules/publico/services/pagina-publica.cache.ts` |
| 9 | `PublicoService` (orquestra 5–8) | `src/modules/publico/services/publico.service.ts` |
| 10 | Controller (ETag, 304, headers, throttler) | `src/modules/publico/controllers/publico.controller.ts` |
| 11 | Conferir a emissão do evento nos services das Fases 2–4 (já implementada lá) e ligar `@OnEvent` ao `PaginaPublicaCache.invalidar` | ver seção 7.3 |
| 12 | Hardening em `main.ts` + `src/config/http.config.ts` | `main.ts`, `config/` |
| 13 | Logs (pino redaction) e métricas | `src/common/observabilidade/**` |
| 14 | Health check | `src/modules/saude/**` |
| 15 | Testes de integração e de vazamento | `test/integration/publico/*.int-spec.ts` |
| 16 | Teste de carga | `test/carga/pagina-publica.k6.js` |
| 17 | Dockerfile, `.dockerignore` | raiz de `api/` |
| 18 | CI (GitHub Actions) | `.github/workflows/api-ci.yml`, `api-deploy.yml`, `api-backup.yml` |
| 19 | Configuração do Supabase e do host | `docs/operacao/` (runbook, ver seção 11) |
| 20 | Teste de restauração do backup | `scripts/restaurar-backup.sh` + runbook |

---

## 6. Página pública — `GET /v1/publico/filiais/:codigo`

### 6.1 Fluxo

```
request ──► throttler "publico" (300/min/IP) ──► validar formato do código
                                                   │ inválido → 404 (sem tocar cache/banco)
                                                   ▼
                                        cache.obter(codigo, agora)
                                   hit (mesmo "hoje") │ miss
                       ┌──────────────────────────────┘
                       │                              ▼
                       │           single-flight: 1 carga por código em paralelo
                       │                              ▼
                       │         consulta 1: filial + lojista + status (skipTenantScope)
                       │            null / excluída / status ≠ ATIVO → cache negativo 10s → 404
                       │                              ▼
                       │          hoje = hojeNoFuso(filial.fuso, agora)
                       │          Promise.all([consulta 2: panfleto vigente,
                       │                       consulta 3: produtos vigentes + categoria])
                       │                              ▼
                       │          montarPagina() → view → JSON string + ETag
                       │                              ▼
                       │          cache.gravar (se a geração não mudou durante a carga)
                       ▼                              ▼
              If-None-Match == ETag ? 304 : 200 com corpo pré-serializado
```

### 6.2 Validação do código (404 barato)

```ts
// src/modules/publico/domain/codigo-publico.ts
export const CODIGO_PUBLICO_REGEX =
  /^[23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;
export const codigoPublicoValido = (c: string): boolean => CODIGO_PUBLICO_REGEX.test(c);
```

Se o formato for inválido, a resposta é o mesmo 404 `RECURSO_NAO_ENCONTRADO` e não há acesso ao banco nem ao cache. Isso barra varredura e lixo de scanners.

### 6.3 Consulta 1 — filial + lojista + status

Única consulta do sistema sem tenant conhecido. Por isso é a única com `skipTenantScope: true`, e um teste de integração garante isso (seção 10.3).

```ts
// pagina-publica.query.ts
async buscarFilialPorCodigo(codigo: string): Promise<FilialPublicaRow | null> {
  return this.filialModel.findOne({
    where: { codigoPublico: codigo },              // paranoid: adiciona deleted_at IS NULL
    attributes: ['id', 'tenantId', 'nome', 'endereco', 'fusoHorario'],
    include: [{
      model: Lojista, attributes: ['nomeFantasia', 'logoPath', 'corPrimaria', 'corSecundaria'], required: true,
      include: [{ model: LojistaAtivacao, attributes: ['status'], required: true }],
    }],
    raw: true, nest: true,
    skipTenantScope: true,
  } as FindOptions);
}
```

SQL esperado:

```sql
SELECT f.id, f.tenant_id, f.nome, f.endereco, f.fuso_horario,
       l.nome_fantasia, l.logo_path, l.cor_primaria, l.cor_secundaria, a.status
FROM filiais f
JOIN lojistas l          ON l.id = f.tenant_id
JOIN lojista_ativacoes a ON a.lojista_id = l.id
WHERE f.codigo_publico = $1 AND f.deleted_at IS NULL
LIMIT 1;
```

EXPLAIN esperado: `Index Scan using filiais_codigo_publico_key on filiais` → `Nested Loop` com `Index Scan using lojistas_pkey` e `Index Scan using lojista_ativacoes_pkey`. Custo constante, menos de 1 ms.

O status é devolvido e avaliado **no service**, e não filtrado no SQL. Assim os caminhos "não existe", "excluída" e "inativo" passam pela mesma consulta e levam o mesmo tempo, e a regra fica testável em unidade.

### 6.4 Consulta 2 — panfleto vigente

O `tenantId` vem da consulta 1, então a trava de tenant fica ativa (sem `skipTenantScope`).

```ts
async buscarPanfletoVigente(tenantId: string, filialId: string, hoje: DataISO) {
  return this.panfletoModel.findOne({
    where: {
      tenantId, filialId,
      [Op.and]: [literal(`daterange(data_inicio, data_limite, '[]') @> ${this.sequelize.escape(hoje)}::date`)],
    },
    attributes: ['imagemPath', 'imagemLargura', 'imagemAltura', 'dataLimite'],
    raw: true,
  });
}
```

SQL esperado:

```sql
SELECT imagem_path, imagem_largura, imagem_altura, data_limite
FROM panfletos
WHERE tenant_id = $1 AND filial_id = $2
  AND daterange(data_inicio, data_limite, '[]') @> $3::date
  AND deleted_at IS NULL
LIMIT 1;
```

- A expressão `daterange(data_inicio, data_limite, '[]')` é a mesma do `EXCLUDE` da Fase 3. Com isso o planner pode usar o índice GiST `panfletos_periodo_sem_sobreposicao`, que é parcial `WHERE deleted_at IS NULL`. EXPLAIN esperado com volume: `Index Scan using panfletos_periodo_sem_sobreposicao`. Com poucas linhas, um `Seq Scan` é normal e não indica problema.
- `data_limite NULL` vira limite superior infinito no `daterange`, equivalente a `data_inicio <= hoje AND (data_limite IS NULL OR data_limite >= hoje)`.
- O `EXCLUDE` garante no máximo 1 linha (RN14). O `LIMIT 1` é só defensivo.

### 6.5 Consulta 3 — produtos vigentes com categoria

```ts
async buscarProdutosVigentes(tenantId: string, filialId: string, hoje: DataISO) {
  return this.produtoModel.findAll({
    where: {
      tenantId, filialId,
      dataInicio: { [Op.lte]: hoje },
      [Op.or]: [{ dataLimite: null }, { dataLimite: { [Op.gte]: hoje } }],
    },
    attributes: ['id', 'nome', 'quantidade', 'precoPromocionalCentavos', 'precoOriginalCentavos',
                 'descricao', 'observacao', 'fotoPath', 'dataLimite', 'categoriaId'],
    include: [{ model: Categoria, attributes: ['id', 'nome'], required: true }], // paranoid → c.deleted_at IS NULL
    raw: true, nest: true,
  });
}
```

SQL esperado:

```sql
SELECT p.id, p.nome, p.quantidade, p.preco_promocional_centavos, p.preco_original_centavos,
       p.descricao, p.observacao, p.foto_path, p.data_limite, p.categoria_id,
       c.id AS "categoria.id", c.nome AS "categoria.nome"
FROM produtos p
INNER JOIN categorias c ON c.id = p.categoria_id AND c.deleted_at IS NULL
WHERE p.tenant_id = $1 AND p.filial_id = $2
  AND p.data_inicio <= $3
  AND (p.data_limite IS NULL OR p.data_limite >= $3)
  AND p.deleted_at IS NULL;
```

EXPLAIN esperado: `Index Scan using produtos_filial_ativos_idx on produtos` (Index Cond: `tenant_id = $1 AND filial_id = $2 AND data_inicio <= $3`; Filter: `data_limite`) → `Nested Loop` / `Hash Join` com `categorias`. O `id` vai só para desempate na ordenação e **não** chega à resposta.

O `ORDER BY` não é feito no SQL: a ordenação pt-BR acontece em memória (seção 6.6). Assim não dependemos da collation ICU do banco, que pode diferir entre local e Supabase.

Consultas 2 e 3 rodam em `Promise.all`, cada uma numa conexão do pool. Não precisam de transação: são leituras independentes e a consistência entre elas é aceitável no nível de "página de ofertas".

### 6.6 Montagem (função pura)

```ts
// src/common/utils/text.ts (Fase 1, reaproveitado)
// export const collatorPtBr = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
// export function compararTextoPtBr(a: string, b: string): number;

// src/modules/publico/domain/montar-pagina.ts
export function montarPagina(entrada: {
  filial: FilialPublicaRow; panfleto: PanfletoRow | null; produtos: ProdutoRow[];
}): PaginaPublica
```

Algoritmo:

1. Agrupar `produtos` num `Map<categoriaId, { nome, produtos[] }>` em O(n).
2. Descartar grupos vazios. Na prática nunca há grupo vazio, porque só entram categorias com produto vigente (RN41), mas o filtro fica explícito e testado.
3. Ordenar os grupos por `compararTextoPtBr(nome)`, com desempate por `categoriaId`. Dentro de cada grupo, ordenar os produtos por `compararTextoPtBr(nome)`, com desempate por `id` (RN30). O desempate deixa a resposta e o ETag estáveis.
4. A view pública (seção 6.7) remove os ids.

Com `sensitivity: 'base'`, maiúsculas e acentos não mudam a ordem primária: `abacate` < `Açúcar` < `Água` (comparando "abacate", "acucar", "agua"). Com `numeric: true`, "Arroz 2kg" vem antes de "Arroz 10kg".

### 6.7 View pública (RNF05: só campos necessários)

```ts
// src/modules/publico/views/pagina-publica.view.ts
export function paginaPublicaView(p: PaginaPublica, storage: StoragePort, hoje: DataISO): PaginaPublicaJson
```

| Campo | Origem | Regra |
| --- | --- | --- |
| `lojista.nome` | `nome_fantasia` | RN28 |
| `lojista.logoUrl` | `storage.urlPublica(logo_path)` ou `null` | |
| `lojista.corPrimaria`, `corSecundaria` | `#RRGGBB` ou `null` | RN06 |
| `filial.nome`, `filial.endereco` | filial | RN28 |
| `panfleto` | `null` se não há vigente | RN29 |
| `panfleto.imagemUrl`, `largura`, `altura` | panfleto | largura e altura evitam layout shift e ajudam o zoom (RNF01) |
| `panfleto.validoAte` | `data_limite` (`YYYY-MM-DD`) ou **ausente** | RN31 (o front formata `dd/mm`) |
| `categorias[].nome` | categoria | RN29, RN41 |
| `produtos[].nome`, `quantidade`, `descricao`, `observacao` | produto | campos opcionais nulos são **omitidos** (payload menor) |
| `produtos[].precoPromocionalCentavos` | inteiro | |
| `produtos[].precoOriginalCentavos` | só quando existe | RN32 ("de/por") |
| `produtos[].fotoUrl` | só quando existe | |
| `produtos[].validoAte` | só quando há `data_limite` | RN31 |
| `hoje` | `YYYY-MM-DD` no fuso da filial | o front não precisa recalcular |
| `geradoEm` | ISO-8601 UTC do momento da montagem | diagnóstico; **fora** do cálculo do ETag |

Nunca expostos: `id` de qualquer entidade, `tenantId`, `filialId`, `categoriaId`, `fusoHorario`, `status`, paths internos de storage, `created_at`/`updated_at`/`deleted_at`.

### 6.8 Resposta 200 — exemplo completo

```http
GET /v1/publico/filiais/k7Qm2xPa HTTP/1.1
Accept-Encoding: br, gzip
```

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Encoding: br
Cache-Control: public, max-age=30, stale-while-revalidate=300
ETag: W/"pQ3x9vT2aB7kLm0d"
Vary: Accept-Encoding
Access-Control-Allow-Origin: *
X-Request-Id: 01JB8Z6Q4M7W5R3T2Y1X0V9U8S
RateLimit-Limit: 300
RateLimit-Remaining: 287
RateLimit-Reset: 41
```

```json
{
  "lojista": {
    "nome": "Mercado Bom Preço",
    "logoUrl": "https://xyz.supabase.co/storage/v1/object/public/midia/logos/01J...-a1b2c3.webp",
    "corPrimaria": "#C8102E",
    "corSecundaria": "#FFD100"
  },
  "filial": { "nome": "Centro", "endereco": "Rua das Flores, 120 — Centro, Campinas/SP" },
  "panfleto": {
    "imagemUrl": "https://xyz.supabase.co/storage/v1/object/public/midia/panfletos/01J...-9f8e7d.webp",
    "largura": 1600,
    "altura": 2263,
    "validoAte": "2026-10-25"
  },
  "categorias": [
    {
      "nome": "Bebidas",
      "produtos": [
        { "nome": "Água mineral", "quantidade": "1,5 L", "precoPromocionalCentavos": 249 },
        {
          "nome": "Refrigerante cola", "quantidade": "2 L",
          "precoPromocionalCentavos": 799, "precoOriginalCentavos": 1099,
          "observacao": "limite 3 por cliente",
          "fotoUrl": "https://xyz.supabase.co/storage/v1/object/public/midia/produtos/01J...-77aa.webp",
          "validoAte": "2026-10-20"
        }
      ]
    },
    {
      "nome": "Mercearia",
      "produtos": [
        { "nome": "abacate", "quantidade": "kg", "precoPromocionalCentavos": 599 },
        { "nome": "Açúcar refinado", "quantidade": "1 kg", "precoPromocionalCentavos": 459, "precoOriginalCentavos": 529 }
      ]
    }
  ],
  "hoje": "2026-10-18",
  "geradoEm": "2026-10-18T15:04:05.123Z"
}
```

### 6.9 Respostas 404, 304 e 429

```http
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8
Cache-Control: public, max-age=10
```
```json
{ "erro": { "codigo": "RECURSO_NAO_ENCONTRADO", "mensagem": "Página não encontrada." } }
```

O corpo e os headers são **idênticos** para código inválido, filial inexistente, filial excluída, lojista aguardando ativação e lojista desativado (RN35). Não vai `X-Request-Id` diferente de um 404 comum, nem ETag, nem `Retry-After`.

```http
HTTP/1.1 304 Not Modified
ETag: W/"pQ3x9vT2aB7kLm0d"
Cache-Control: public, max-age=30, stale-while-revalidate=300
```

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 23
```
```json
{ "erro": { "codigo": "MUITAS_TENTATIVAS", "mensagem": "Muitas requisições. Tente novamente em instantes." } }
```

### 6.10 `PublicoService`

```ts
@Injectable()
export class PublicoService {
  constructor(
    private readonly query: PaginaPublicaQuery,
    private readonly cache: PaginaPublicaCache,
    private readonly storage: StoragePort,
    private readonly clock: ClockService,
  ) {}

  /** Devolve a página pronta (JSON serializado + ETag) ou lança RecursoNaoEncontradoError. */
  async obterPagina(codigo: string): Promise<PaginaPublicaPronta>;
}

export interface PaginaPublicaPronta {
  corpo: string;       // JSON já serializado: o controller não serializa de novo
  etag: string;        // W/"<16 chars base64url de sha1(conteúdo sem geradoEm)>"
  hoje: DataISO;
  tenantId: string;    // uso interno (índice do cache), nunca serializado
  filialId: string;    // uso interno (índice do cache), nunca serializado
}
```

Algoritmo de `obterPagina(codigo)`:

1. Se `!codigoPublicoValido(codigo)`, lançar `RecursoNaoEncontradoError`.
2. `agora = clock.agora()`.
3. `cache.obter(codigo, agora)`:
   - `{ tipo: 'negativo' }`: lançar `RecursoNaoEncontradoError`.
   - `{ tipo: 'positivo', pagina }`: devolver `pagina` se `pagina.hoje === hojeNoFuso(pagina.fuso, agora)`; senão, tratar como miss (virada de dia).
4. Miss: `cache.carregarUmaVez(codigo, () => this.carregar(codigo, agora))`, com single-flight (seção 7.2).
5. `carregar`:
   1. `geracao = cache.geracaoAtual(codigo)`.
   2. `filial = query.buscarFilialPorCodigo(codigo)`.
   3. Se `!filial || filial.lojista.ativacao.status !== 'ATIVO'`: `cache.gravarNegativo(codigo, geracao)` e lançar 404.
   4. `hoje = hojeNoFuso(filial.fusoHorario, agora)`.
   5. `[panfleto, produtos] = await Promise.all([query.buscarPanfletoVigente(...), query.buscarProdutosVigentes(...)])`.
   6. `json = paginaPublicaView(montarPagina(...), storage, hoje)` com `geradoEm = agora.toISOString()`.
   7. `etag = etagFraco(json sem geradoEm)`; `corpo = JSON.stringify(json)`.
   8. `cache.gravar(codigo, pronta, ttl = min(60, segundosAteMeiaNoite(fuso, agora)), geracao)`.
   9. Devolver `pronta`.

### 6.11 Controller

```ts
@Controller('publico')
@Public()
@SkipThrottle({ login: true })
@Throttle({ publico: { limit: 300, ttl: 60_000 } })
export class PublicoController {
  @Get('filiais/:codigo')
  async obter(@Param('codigo') codigo: string, @Headers('if-none-match') inm: string | undefined,
              @Res({ passthrough: false }) res: Response): Promise<void> {
    const pagina = await this.service.obterPagina(codigo);
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
    res.setHeader('ETag', pagina.etag);
    if (inm && ifNoneMatchContem(inm, pagina.etag)) { res.status(304).end(); return; }
    res.type('application/json; charset=utf-8').status(200).send(pagina.corpo);
  }
}
```

- O 404 sai pelo `AppExceptionFilter`. A Fase 5 acrescenta que, para rotas `/v1/publico/*` com `RECURSO_NAO_ENCONTRADO`, o filtro define `Cache-Control: public, max-age=10`.
- `ifNoneMatchContem` aceita lista separada por vírgula e `*`, e compara de forma fraca (ignora o prefixo `W/`).
- Também responde `HEAD` (o Express trata `HEAD` em rotas `GET`).

### 6.12 Por que `max-age=30, stale-while-revalidate=300`

| Preocupação | Efeito |
| --- | --- |
| Desempenho em 4G fraca (RNF02) | Consumidor que volta à página em até 30 s não faz requisição. Até 5 min depois, o navegador mostra a versão em cache na hora e revalida em segundo plano (304 se nada mudou, com corpo mínimo) |
| Lojista desativado precisa sair do ar (RN35) | Pior caso no servidor: até 60 s (TTL do cache em memória, porque a desativação é manual no banco e não gera evento). No navegador que já tinha a página: até 30 s sem requisição, mais **uma** exibição desatualizada durante a revalidação, que já recebe 404 e substitui o cache. Total ≤ 90 s mais uma visualização, aceitável para uma ação manual do administrador |
| Mudança de preço pelo lojista | O evento invalida o servidor na hora; o consumidor vê a mudança em ≤ 30 s, ou na revalidação |
| Virada do dia (vencimento à meia-noite) | TTL do servidor limitado até a meia-noite e checagem de `hoje` em cada hit; `max-age=30` limita a defasagem no navegador a 30 s |

Valores maiores (ex.: `max-age=300`) foram descartados porque esticariam o pior caso de RN35 e de preço vencido.

---

## 7. Cache da página pública

### 7.1 Estrutura

```ts
// src/modules/publico/services/pagina-publica.cache.ts
@Injectable()
export class PaginaPublicaCache {
  private readonly lru = new LRUCache<string, EntradaCache>({ max: 5_000, ttlAutopurge: false });
  private readonly geracoes = new Map<string, number>();          // codigo → geração
  private readonly porFilial = new Map<string, string>();         // filialId → codigo
  private readonly porTenant = new Map<string, Set<string>>();    // tenantId → codigos
  private readonly emCarga = new Map<string, Promise<PaginaPublicaPronta>>();

  obter(codigo: string, agora: Date): ResultadoCache | undefined;
  gravar(codigo: string, pagina: PaginaPublicaPronta & { fuso: string }, ttlSeg: number, geracao: number): void;
  gravarNegativo(codigo: string, geracao: number): void;          // TTL 10 s
  geracaoAtual(codigo: string): number;
  carregarUmaVez(codigo: string, fn: () => Promise<PaginaPublicaPronta>): Promise<PaginaPublicaPronta>;
  invalidar(evento: ConteudoAlteradoEvento): void;
}

type EntradaCache =
  | { tipo: 'positivo'; pagina: PaginaPublicaPronta & { fuso: string } }
  | { tipo: 'negativo' };
```

- **Capacidade**: 5 mil entradas. Com cerca de 30 KB por página de 200 produtos, o pior caso fica em torno de 150 MB; o normal é bem menos. `MAX_ENTRADAS` e o TTL máximo ficam em `config/publico.config.ts` (`PUBLICO_CACHE_MAX`, `PUBLICO_CACHE_TTL_MAX_SEG=60`, `PUBLICO_CACHE_NEGATIVO_SEG=10`, `PUBLICO_CACHE_DESATIVADO=false`).
- **TTL positivo**: `max(1, min(60, segundosAteMeiaNoite(fuso, agora)))`, passado por entrada (`lru.set(k, v, { ttl: ttlSeg * 1000 })`).
- **TTL negativo**: 10 s. Assim um lojista recém-ativado aparece em até 10 s, e varredura de códigos válidos inexistentes não martela o banco.
- **Índices secundários** (`porFilial`, `porTenant`) são mantidos no `gravar` e limpos no `dispose` do LRU, para não vazar memória.

### 7.2 Concorrência

- **Single-flight**: `carregarUmaVez` guarda a Promise em `emCarga`. Requisições simultâneas do mesmo código (fila na porta da loja) esperam a mesma carga, o que faz 1 ida ao banco em vez de N. A entrada é removida em `finally`.
- **Geração contra corrida**: `invalidar` incrementa `geracoes[codigo]`. `gravar` e `gravarNegativo` só gravam se a geração recebida for igual à atual. Isso evita que uma carga iniciada **antes** de uma edição grave dados antigos **depois** da invalidação.

### 7.3 Invalidação por evento

Evento: `filial.conteudo-alterado` (`EVENTO_CONTEUDO_ALTERADO`), com payload `ConteudoAlteradoEvento = { tenantId: string; filialId?: string }`, ambos definidos na Fase 2 (10.3.1) em `common/eventos/conteudo-alterado.event.ts`. O `PaginaPublicaCache` assina com `@OnEvent(EVENTO_CONTEUDO_ALTERADO)`.

- Com `filialId`: invalida o código daquela filial.
- Sem `filialId`: invalida todos os códigos do tenant (identidade visual).

Os eventos são emitidos **depois do commit** (`transaction.afterCommit(() => this.eventos.emit(...))`) pelos services das Fases 2–4, que já trazem os testes de emissão. Emitir antes do commit permitiria que uma carga concorrente relesse os dados antigos.

| Service (fase) | Métodos que emitem | Payload |
| --- | --- | --- |
| `FiliaisService` (2) | `criar`, `editar` (nome, endereço, fuso), `excluir` | `{ tenantId, filialId }` |
| `PanfletosService` (3) | `criar`, `editarDatas`, `trocarImagem`, `excluir` | `{ tenantId, filialId }` |
| `IdentidadeService` (3) | `editar` (nome, cores), `trocarLogo` | `{ tenantId }` |
| `CategoriasService` (4) | `renomear`, `excluir` | `{ tenantId, filialId }` |
| `ProdutosService` (4) | `criar`, `editar`, `excluir` | `{ tenantId, filialId }` |
| `ProdutoFotoService` (4) | `substituir`, `remover` | `{ tenantId, filialId }` |

Não emitem: `CategoriasService.criar` (categoria vazia não aparece, RN41), cadastro e login do lojista e mudança de status no banco (manual, coberta pela TTL).

**Multi-instância**: o evento é local ao processo. Com mais de uma instância, as outras só se atualizam pela TTL, então **60 s é o limite máximo de inconsistência** entre instâncias. Se isso não bastar, a evolução é Postgres `LISTEN/NOTIFY` (sem infraestrutura nova) ou Redis pub/sub. Não entra no MVP.

### 7.4 Utilitário `segundosAteMeiaNoite`

```ts
// src/common/utils/date-only.ts
export function segundosAteMeiaNoite(fuso: string, agora: Date): number {
  const p = partesNoFuso(fuso, agora);            // Intl.DateTimeFormat('en-US', { timeZone, hour12:false, ... })
  const decorridos = p.hora * 3600 + p.minuto * 60 + p.segundo;
  return Math.max(1, 86_400 - decorridos);
}
```

Em dias com mudança de horário de verão (fusos fora do Brasil) o valor pode errar em até 1 h, mas a checagem de `hoje` em cada hit (passo 3 de 6.10) garante a correção. O TTL até a meia-noite é só uma otimização.

### 7.5 Evolução (fora do MVP)

Um CDN na frente de `/v1/publico/*` respeitaria o `Cache-Control` atual sem mudança de código. Nesse caso, reduzir `s-maxage` para ≤ 30 e avaliar purga por API no evento.

---

## 8. Rate limit

| Throttler | Rotas | Limite | Observação |
| --- | --- | --- | --- |
| `login` (Fase 1) | `/v1/auth/login` | mantém o da Fase 1 | |
| `publico` | `/v1/publico/*` | **300 req/min por IP** | |
| `padrao` | `/v1/painel/*` | 600 req/min por tenant (chave = `sub` do JWT) | proteção contra loop no front |

Por que 300 e não 120: em 4G muitos consumidores saem pelo mesmo IP da operadora (CGNAT). Numa fila de loja com 30 pessoas abrindo a página e revalidando, 120/min poderia bloquear clientes legítimos. Como o custo de uma requisição em cache é desprezível, 300 continua barrando abuso.

- A chave do throttler é `req.ips[0] ?? req.ip`, que exige `trust proxy` configurado (seção 11.1). Sem ele, todos os clientes teriam o IP do load balancer.
- O armazenamento é em memória por instância (limite efetivo = limite × instâncias). Isso fica documentado como aceitável.
- A resposta é 429 `MUITAS_TENTATIVAS` com `Retry-After`.

---

## 9. Limites por lojista (RNF12)

### 9.1 Migration

```js
// src/database/migrations/20261101000000-criar-lojista-limites.js
'use strict';
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE lojista_limites (
        lojista_id               uuid PRIMARY KEY REFERENCES lojistas(id) ON DELETE RESTRICT,
        max_filiais              integer NULL CHECK (max_filiais IS NULL OR max_filiais >= 0),
        max_produtos_por_filial  integer NULL CHECK (max_produtos_por_filial IS NULL OR max_produtos_por_filial >= 0),
        max_imagem_bytes         integer NULL CHECK (max_imagem_bytes IS NULL OR max_imagem_bytes > 0),
        created_at               timestamptz NOT NULL DEFAULT now(),
        updated_at               timestamptz NOT NULL DEFAULT now()
      );
      COMMENT ON TABLE lojista_limites IS
        'RNF12: limites por lojista. Sem linha ou coluna NULL = sem limite. Editada pelo administrador direto no banco.';
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE lojista_limites;');
  },
};
```

- Não há backfill: a ausência de linha significa "sem limite", e os valores padrão continuam em aberto.
- Assim como `lojista_ativacoes`, a tabela não tem rota: o administrador edita no banco.

### 9.2 Model

`src/modules/limites/models/lojista-limite.model.ts`, `@Table({ tableName: 'lojista_limites', underscored: true, paranoid: false })`. A PK é `lojistaId`; o model **não** é `@TenantScoped`, porque a PK já é o tenant e a busca é sempre por PK no service.

### 9.3 `LimitesService` (implementa `VerificadorLimites` da Fase 2)

```ts
export type RecursoLimitado = 'FILIAIS' | 'PRODUTOS_POR_FILIAL';

@Injectable()
export class LimitesService implements VerificadorLimites {
  /** Contrato da Fase 2. Chamar DENTRO da transação de criação. Lança LimiteDoPlanoAtingidoError. */
  verificarCriacaoFilial(tenantId: string, opts: { transaction: Transaction }): Promise<void>;          // = verificar(tenantId, 'FILIAIS', opts)
  verificarCriacaoProduto(tenantId: string, filialId: string, opts: { transaction: Transaction }): Promise<void>; // = verificar(tenantId, 'PRODUTOS_POR_FILIAL', { ...opts, filialId })

  /** Limite efetivo de bytes por imagem: min(global MAX_IMAGEM_BYTES, limite do lojista). */
  maxImagemBytes(tenantId: string): Promise<number>;

  /** Implementação comum, privada. */
  private verificar(tenantId: string, recurso: RecursoLimitado, ctx: { transaction: Transaction; filialId?: string }): Promise<void>;
}
```

Algoritmo de `verificar` (privado, usado pelos dois métodos públicos):

1. `limite = LojistaLimite.findByPk(tenantId, { attributes: [coluna], transaction })`. Se não houver linha ou a coluna for `NULL`, retornar (sem limite e sem custo extra).
2. Serializar a criação concorrente do mesmo tenant: `SELECT 1 FROM lojistas WHERE id = $1 FOR UPDATE` na transação recebida. O bloqueio só acontece quando há limite configurado.
3. Contar as linhas não excluídas: `Filial.count({ where: { tenantId }, transaction })` ou `Produto.count({ where: { tenantId, filialId }, transaction })`. O paranoid já ignora as excluídas.
4. Se `contagem >= limite`, lançar `LimiteDoPlanoAtingidoError` (409 `LIMITE_DO_PLANO_ATINGIDO`, `detalhes: { recurso, limite }`).

**Decisão**: produtos **vencidos não excluídos** contam no limite, porque continuam guardados (RN25). O lojista pode excluí-los para liberar espaço. Isso fica registrado para revisão quando os planos forem definidos.

`maxImagemBytes`: o limite global (`MAX_IMAGEM_BYTES`, Fase 3) continua no `multer`, que barra o upload em streaming. Depois do upload, `MidiaService.processar(tenantId, …)` (Fase 3) compara `buffer.length` com `maxImagemBytes(tenantId)` e lança `IMAGEM_MUITO_GRANDE` (413). O resultado é cacheado 30 s por tenant (LRU).

### 9.4 Onde é chamado

| Ponto (fase) | Chamada |
| --- | --- |
| `FiliaisService.criar` (2) | `limites.verificarCriacaoFilial(tenantId, { transaction })` antes do `create` |
| `ProdutosService.criar` (4) | `limites.verificarCriacaoProduto(tenantId, filialId, { transaction })` antes do `create` |
| `MidiaService.processar(tenantId, …)` (3): panfleto, foto de produto, logo | `if (buffer.length > await limites.maxImagemBytes(tenantId)) throw new ImagemMuitoGrandeError()` |

A troca de implementação é feita no `LimitesModule` (global, Fase 2), com `{ provide: VERIFICADOR_LIMITES, useClass: LimitesService }` substituindo o `SemLimitesVerificador`. Nenhum service consumidor muda.

---

## 10. Testes (BDD)

Formato, builders, relógio fixo e gate de cobertura seguem a visão geral. Os cenários estão em Gherkin pt-BR e viram `describe`/`it` em Jest.

Relógio padrão nos cenários: `agora = 2026-10-18T15:00:00Z` (12:00 em America/Sao_Paulo, então `hoje = 2026-10-18`), salvo indicação.

### 10.1 Unitários — `codigoPublicoValido` (`publico/domain/__tests__/codigo-publico.spec.ts`)

```gherkin
Funcionalidade: Validação do formato do código público (RN39)

  Esquema do Cenário: código com formato <situacao>
    Dado o código "<codigo>"
    Quando valido o formato
    Então o resultado é <valido>

    Exemplos:
      | situacao                    | codigo     | valido |
      | válido                      | k7Qm2xPa   | true   |
      | curto                       | k7Qm2xP    | false  |
      | longo                       | k7Qm2xPaa  | false  |
      | com caractere ambíguo "0"   | k7Qm2x0a   | false  |
      | com caractere ambíguo "l"   | k7Qm2xla   | false  |
      | com caractere ambíguo "I"   | k7Qm2xIa   | false  |
      | com símbolo                 | k7Qm2x-a   | false  |
      | vazio                       |            | false  |
      | tentativa de injeção        | ' OR 1=1-- | false  |
```

### 10.2 Unitários — `compararTextoPtBr` (`common/utils/__tests__/text.spec.ts`)

```gherkin
Funcionalidade: Ordenação alfabética em português (RN30)

  Cenário: acentos e maiúsculas não alteram a ordem primária
    Dado os nomes "Água", "Açúcar", "abacate"
    Quando ordeno com compararTextoPtBr
    Então a ordem é "abacate", "Açúcar", "Água"

  Cenário: números são comparados pelo valor
    Dado os nomes "Arroz 10kg", "Arroz 2kg", "Arroz 5kg"
    Quando ordeno com compararTextoPtBr
    Então a ordem é "Arroz 2kg", "Arroz 5kg", "Arroz 10kg"

  Cenário: nomes iguais ignorando acento e caixa
    Dado os nomes "Cafe" e "Café"
    Quando comparo
    Então o resultado é 0
```

### 10.3 Unitários — `segundosAteMeiaNoite` e `hojeNoFuso` (`common/utils/__tests__/date-only.spec.ts`)

```gherkin
Funcionalidade: Tempo até a virada do dia no fuso da filial (RN24, RNF06)

  Esquema do Cenário: segundos restantes
    Dado o instante "<agora_utc>" e o fuso "<fuso>"
    Quando calculo segundosAteMeiaNoite
    Então o resultado é <segundos>

    Exemplos:
      | agora_utc                | fuso               | segundos |
      | 2026-10-18T15:00:00Z     | America/Sao_Paulo  | 43200    |
      | 2026-10-19T02:59:30Z     | America/Sao_Paulo  | 30       |
      | 2026-10-19T03:00:00Z     | America/Sao_Paulo  | 86400    |
      | 2026-10-19T03:59:59Z     | America/Manaus     | 1        |
      | 2026-10-19T04:30:00Z     | America/Rio_Branco | 84600    |

  Cenário: nunca devolve zero
    Dado o instante exatamente à meia-noite menos 0,4 s no fuso
    Quando calculo segundosAteMeiaNoite
    Então o resultado é maior ou igual a 1

  Cenário: mesmo instante, dias diferentes por fuso
    Dado o instante "2026-10-19T03:30:00Z"
    Quando calculo hojeNoFuso para "America/Sao_Paulo" e para "America/Manaus"
    Então obtenho "2026-10-19" e "2026-10-18"
```

### 10.4 Unitários — `montarPagina` (`publico/domain/__tests__/montar-pagina.spec.ts`)

```gherkin
Funcionalidade: Montagem da página pública (RN29, RN30, RN41)

  Cenário: agrupa produtos por categoria
    Dado produtos vigentes "Leite" e "Queijo" na categoria "Laticínios" e "Pão" em "Padaria"
    Quando monto a página
    Então há 2 categorias
    E "Laticínios" contém "Leite" e "Queijo"
    E "Padaria" contém "Pão"

  Cenário: categorias e produtos em ordem alfabética pt-BR
    Dado as categorias "Mercearia", "bebidas", "Açougue" com produtos
    E na categoria "Mercearia" os produtos "Água", "Açúcar", "abacate"
    Quando monto a página
    Então as categorias vêm na ordem "Açougue", "bebidas", "Mercearia"
    E os produtos de "Mercearia" vêm na ordem "abacate", "Açúcar", "Água"

  Cenário: desempate estável por id
    Dado dois produtos chamados "Arroz" com ids "01J..B" e "01J..A"
    Quando monto a página duas vezes com a entrada em ordens diferentes
    Então nas duas vezes o produto "01J..A" vem antes
    E o resultado serializado é idêntico

  Cenário: sem produtos vigentes
    Dado nenhum produto vigente
    Quando monto a página
    Então "categorias" é uma lista vazia

  Cenário: categoria vazia não aparece (RN41)
    Dado um grupo de categoria sem produtos na entrada
    Quando monto a página
    Então a categoria não aparece
```

### 10.5 Unitários — `paginaPublicaView` (`publico/views/__tests__/pagina-publica.view.spec.ts`)

```gherkin
Funcionalidade: View pública com campos mínimos (RN28, RN31, RN32, RNF05)

  Cenário: produto com preço original exibe "de/por" (RN32)
    Dado um produto com promocional 799 e original 1099
    Quando gero a view
    Então o produto tem "precoPromocionalCentavos" 799 e "precoOriginalCentavos" 1099

  Cenário: produto sem preço original
    Dado um produto com promocional 459 e sem original
    Quando gero a view
    Então o produto não tem a chave "precoOriginalCentavos"

  Cenário: produto com data limite mostra validoAte (RN31)
    Dado um produto com data limite "2026-10-20"
    Quando gero a view
    Então o produto tem "validoAte" igual a "2026-10-20"

  Cenário: produto sem data limite
    Dado um produto sem data limite
    Quando gero a view
    Então o produto não tem a chave "validoAte"

  Cenário: panfleto com e sem data limite (RN31)
    Dado um panfleto vigente com data limite "2026-10-25"
    Quando gero a view
    Então "panfleto.validoAte" é "2026-10-25"
    E dado um panfleto sem data limite, "panfleto" não tem a chave "validoAte"

  Cenário: sem panfleto vigente
    Dado que não há panfleto vigente
    Quando gero a view
    Então "panfleto" é null

  Cenário: identidade visual e filial (RN28)
    Dado o lojista "Mercado Bom Preço" com cores "#C8102E" e "#FFD100" e logo "logos/x.webp"
    E a filial "Centro" com endereço "Rua das Flores, 120"
    Quando gero a view
    Então "lojista.nome", "lojista.corPrimaria", "lojista.corSecundaria" e "filial" são os informados
    E "lojista.logoUrl" é storage.urlPublica("logos/x.webp")

  Cenário: lojista sem logo nem cores
    Dado o lojista sem logo e sem cores
    Quando gero a view
    Então "logoUrl", "corPrimaria" e "corSecundaria" são null

  Cenário: campos opcionais vazios são omitidos
    Dado um produto sem quantidade, descrição, observação e foto
    Quando gero a view
    Então o produto tem apenas "nome" e "precoPromocionalCentavos"

  Cenário: nenhuma informação interna é exposta (RNF05)
    Dado uma página completa
    Quando gero a view e percorro todas as chaves recursivamente
    Então nenhuma chave casa com /(^id$|Id$|tenant|deleted|created|updated|path|fuso|status)/i
    E nenhum valor casa com o padrão de UUID
```

### 10.6 Unitários — `PublicoService` (`publico/services/__tests__/publico.service.spec.ts`)

Mocks: `PaginaPublicaQuery` (3 métodos `jest.fn()`), `PaginaPublicaCache` **real** (a lógica é pura e em memória), `StoragePort` falso (`urlPublica = p => 'https://cdn/' + p`) e `ClockService` fixo.

```gherkin
Funcionalidade: Obter página pública da filial (RN23, RN27–RN32, RN35, RN41)

  Contexto:
    Dado o relógio em "2026-10-18T15:00:00Z"
    E a filial "Centro" com código "k7Qm2xPa" e fuso "America/Sao_Paulo"

  # --- Status do lojista (RN23, RN35) ---

  Cenário: lojista ativo recebe a página
    Dado o lojista com status "ATIVO"
    Quando obtenho a página "k7Qm2xPa"
    Então recebo a página com o nome da filial "Centro"

  Esquema do Cenário: lojista não ativo responde como inexistente
    Dado o lojista com status "<status>"
    Quando obtenho a página "k7Qm2xPa"
    Então recebo RecursoNaoEncontradoError
    E as consultas de panfleto e de produtos não são executadas

    Exemplos:
      | status              |
      | AGUARDANDO_ATIVACAO |
      | DESATIVADO          |

  Cenário: erro idêntico para inexistente, inativo e excluído
    Dado três chamadas: código inexistente, lojista desativado e filial excluída
    Quando obtenho a página em cada caso
    Então as três exceções têm o mesmo código e a mesma mensagem

  # --- Filial e código ---

  Cenário: filial excluída logicamente
    Dado que a busca da filial pelo código retorna null por causa do deleted_at
    Quando obtenho a página "k7Qm2xPa"
    Então recebo RecursoNaoEncontradoError

  Cenário: código inexistente
    Dado que nenhuma filial tem o código "zzzzzzzz"
    Quando obtenho a página "zzzzzzzz"
    Então recebo RecursoNaoEncontradoError

  Cenário: código com formato inválido não toca o banco nem o cache
    Quando obtenho a página "abc"
    Então recebo RecursoNaoEncontradoError
    E buscarFilialPorCodigo não é chamado
    E o cache não ganha nenhuma entrada

  # --- Panfleto (RN14, RN23, RN29) ---

  Cenário: sem panfleto
    Dado que buscarPanfletoVigente retorna null
    Quando obtenho a página
    Então "panfleto" é null
    E os produtos são retornados normalmente

  Cenário: panfleto vigente
    Dado um panfleto de "2026-10-15" a "2026-10-25"
    Quando obtenho a página
    Então "panfleto.imagemUrl" é preenchida e "panfleto.validoAte" é "2026-10-25"

  Cenário: panfleto consultado com "hoje" no fuso da filial
    Quando obtenho a página
    Então buscarPanfletoVigente é chamado com tenantId, filialId e "2026-10-18"

  Cenário: panfleto agendado não é retornado pela consulta
    Dado um panfleto agendado para "2026-10-20" e a consulta retorna null para "2026-10-18"
    Quando obtenho a página
    Então "panfleto" é null

  Cenário: panfleto vencido não é retornado pela consulta
    Dado um panfleto de "2026-10-01" a "2026-10-17" e a consulta retorna null para "2026-10-18"
    Quando obtenho a página
    Então "panfleto" é null
    # O filtro real de datas é verificado na integração (10.12)

  # --- Produtos e categorias (RN29, RN30, RN41) ---

  Cenário: produtos agrupados e ordenados
    Dado produtos "Água" e "Açúcar" em "Mercearia" e "Detergente" em "Limpeza"
    Quando obtenho a página
    Então as categorias são "Limpeza", "Mercearia"
    E os produtos de "Mercearia" são "Açúcar", "Água"

  Cenário: categoria sem produto vigente não aparece (RN41)
    Dado a categoria "Hortifruti" cujo único produto venceu ontem
    E a consulta de produtos vigentes não retorna nada de "Hortifruti"
    Quando obtenho a página
    Então "Hortifruti" não está em "categorias"

  Cenário: produtos de categoria excluída não aparecem
    Dado a categoria "Sazonais" excluída logicamente
    E a consulta de produtos (inner join com categoria não excluída) não retorna produtos dela
    Quando obtenho a página
    Então "Sazonais" não está em "categorias"

  Cenário: preço "de/por" (RN32)
    Dado um produto com promocional 799 e original 1099
    Quando obtenho a página
    Então o produto exibe 799 e 1099

  Cenário: validoAte do produto (RN31)
    Dado um produto com data limite "2026-10-20" e outro sem data limite
    Quando obtenho a página
    Então o primeiro tem "validoAte" "2026-10-20" e o segundo não tem "validoAte"

  # --- Virada de dia no fuso (RN24, RNF06) ---

  Cenário: 23:59 em São Paulo ainda é o mesmo dia
    Dado o relógio em "2026-10-19T02:59:00Z"
    Quando obtenho a página
    Então as consultas recebem hoje = "2026-10-18"
    E "hoje" na resposta é "2026-10-18"

  Cenário: 00:00 em São Paulo já é o dia seguinte
    Dado o relógio em "2026-10-19T03:00:00Z"
    Quando obtenho a página
    Então as consultas recebem hoje = "2026-10-19"

  Cenário: filial em Manaus usa o próprio fuso
    Dado a filial com fuso "America/Manaus" e o relógio em "2026-10-19T03:30:00Z"
    Quando obtenho a página
    Então as consultas recebem hoje = "2026-10-18"

  Cenário: entrada em cache do dia anterior é descartada na virada
    Dado a página gravada no cache com hoje = "2026-10-18"
    E o relógio avança para "2026-10-19T03:00:01Z"
    Quando obtenho a página
    Então as consultas são executadas de novo com hoje = "2026-10-19"

  # --- Execução e montagem ---

  Cenário: consultas 2 e 3 são disparadas em paralelo
    Dado consultas de panfleto e produtos que só resolvem quando liberadas manualmente
    Quando obtenho a página
    Então as duas são chamadas antes que qualquer uma resolva

  Cenário: corpo pré-serializado e ETag
    Quando obtenho a página
    Então "corpo" é um JSON válido igual à view
    E "etag" começa com 'W/"' e tem 16 caracteres entre aspas

  Cenário: ETag não muda só porque geradoEm mudou
    Dado duas cargas da mesma página com relógios diferentes no mesmo dia e sem mudança de dados
    Quando comparo os ETags
    Então são iguais

  Cenário: ETag muda quando o preço muda
    Dado duas cargas em que o preço de um produto mudou
    Quando comparo os ETags
    Então são diferentes

  Cenário: erro inesperado na consulta não é cacheado
    Dado que buscarProdutosVigentes lança erro de conexão
    Quando obtenho a página
    Então o erro é propagado
    E a próxima chamada executa as consultas de novo
```

**Exemplo Jest** (trecho):

```ts
describe('Funcionalidade: Obter página pública da filial (RN23, RN35)', () => {
  let service: PublicoService;
  let query: jest.Mocked<PaginaPublicaQuery>;
  let clock: { agora: jest.Mock };

  beforeEach(async () => {
    query = { buscarFilialPorCodigo: jest.fn(), buscarPanfletoVigente: jest.fn(), buscarProdutosVigentes: jest.fn() } as any;
    clock = { agora: jest.fn().mockReturnValue(new Date('2026-10-18T15:00:00Z')) };
    const mod = await Test.createTestingModule({
      providers: [
        PublicoService, PaginaPublicaCache,
        { provide: PaginaPublicaQuery, useValue: query },
        { provide: STORAGE_PORT, useValue: { urlPublica: (p: string) => `https://cdn/${p}` } },
        { provide: ClockService, useValue: clock },
      ],
    }).compile();
    service = mod.get(PublicoService);
    query.buscarPanfletoVigente.mockResolvedValue(null);
    query.buscarProdutosVigentes.mockResolvedValue([]);
  });

  describe.each(['AGUARDANDO_ATIVACAO', 'DESATIVADO'])('Cenário: lojista %s responde como inexistente', (status) => {
    describe(`Dado o lojista com status "${status}"`, () => {
      beforeEach(() => query.buscarFilialPorCodigo.mockResolvedValue(umaFilialPublica().comStatus(status).build()));

      describe('Quando obtenho a página "k7Qm2xPa"', () => {
        it('Então recebo RecursoNaoEncontradoError', async () => {
          await expect(service.obterPagina('k7Qm2xPa')).rejects.toBeInstanceOf(RecursoNaoEncontradoError);
        });
        it('E as consultas de panfleto e de produtos não são executadas', async () => {
          await service.obterPagina('k7Qm2xPa').catch(() => undefined);
          expect(query.buscarPanfletoVigente).not.toHaveBeenCalled();
          expect(query.buscarProdutosVigentes).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('Cenário: 00:00 em São Paulo já é o dia seguinte', () => {
    describe('Dado o relógio em "2026-10-19T03:00:00Z"', () => {
      beforeEach(() => {
        clock.agora.mockReturnValue(new Date('2026-10-19T03:00:00Z'));
        query.buscarFilialPorCodigo.mockResolvedValue(umaFilialPublica().comStatus('ATIVO').build());
      });
      describe('Quando obtenho a página', () => {
        it('Então as consultas recebem hoje = "2026-10-19"', async () => {
          await service.obterPagina('k7Qm2xPa');
          expect(query.buscarProdutosVigentes).toHaveBeenCalledWith(expect.any(String), expect.any(String), '2026-10-19');
        });
      });
    });
  });
});
```

### 10.7 Unitários — `PaginaPublicaCache` (`publico/services/__tests__/pagina-publica.cache.spec.ts`)

Usar `jest.useFakeTimers()` e o relógio mockado; o LRU recebe `perf` injetável (`new LRUCache({ perf: { now: () => fakeNow } })`) para controlar o TTL.

```gherkin
Funcionalidade: Cache da página pública

  Cenário: miss na primeira requisição
    Dado o cache vazio
    Quando obtenho "k7Qm2xPa"
    Então o resultado é undefined

  Cenário: hit após gravar
    Dado a página "k7Qm2xPa" gravada com TTL 60 s
    Quando obtenho "k7Qm2xPa" 59 s depois
    Então recebo a página gravada

  Cenário: expira após o TTL
    Dado a página gravada com TTL 60 s
    Quando obtenho 61 s depois
    Então o resultado é undefined

  Cenário: TTL limitado até a meia-noite no fuso da filial
    Dado o relógio às 23:59:30 em America/Sao_Paulo
    Quando o service grava a página
    Então o TTL usado é 30 s

  Cenário: TTL no meio do dia é o máximo configurado
    Dado o relógio às 12:00 em America/Sao_Paulo
    Quando o service grava a página
    Então o TTL usado é 60 s

  Cenário: invalidação por filial
    Dado as páginas das filiais F1 (código A) e F2 (código B) do mesmo tenant em cache
    Quando recebo o evento "filial.conteudo-alterado" com { tenantId, filialId: F1 }
    Então A sai do cache
    E B continua em cache

  Cenário: invalidação por tenant (identidade visual)
    Dado as páginas de F1 e F2 do tenant T1 e de F3 do tenant T2 em cache
    Quando recebo o evento com { tenantId: T1 } sem filialId
    Então F1 e F2 saem do cache
    E F3 continua em cache

  Cenário: evento de filial que não está em cache
    Quando recebo o evento para uma filial nunca carregada
    Então nada falha e a geração do código não muda

  Cenário: carga iniciada antes da invalidação não grava dado antigo
    Dado uma carga de "A" iniciada com geração 0
    E durante a carga chega o evento que invalida "A" (geração 1)
    Quando a carga tenta gravar com geração 0
    Então nada é gravado
    E a próxima requisição carrega de novo

  Cenário: cache negativo para 404
    Dado que "zzzzzzzz" foi gravado como negativo
    Quando obtenho "zzzzzzzz" 9 s depois
    Então recebo { tipo: "negativo" }
    E 11 s depois o resultado é undefined

  Cenário: lojista ativado aparece após o cache negativo
    Dado "k7Qm2xPa" negativo porque o lojista aguardava ativação
    E o administrador ativa o lojista no banco
    Quando obtenho a página 11 s depois
    Então a página é carregada e retornada

  Cenário: single-flight em requisições simultâneas
    Dado 50 requisições simultâneas de "k7Qm2xPa" com cache vazio
    Quando todas são atendidas
    Então buscarFilialPorCodigo é chamado 1 vez
    E as 50 recebem o mesmo ETag

  Cenário: falha na carga libera o single-flight
    Dado uma carga que falha
    Quando chega uma nova requisição
    Então uma nova carga é iniciada

  Cenário: índices secundários são limpos quando o LRU descarta
    Dado o cache com capacidade 2 e as páginas A e B
    Quando gravo C
    Então A é descartado
    E o evento de invalidação da filial de A não referencia mais o código A

  Cenário: cache desativado por configuração
    Dado PUBLICO_CACHE_DESATIVADO = true
    Quando gravo e obtenho uma página
    Então o resultado é sempre undefined
```

### 10.8 Unitários — `PublicoController` (ETag/304/headers) (`publico/controllers/__tests__/publico.controller.spec.ts`)

```gherkin
Funcionalidade: Respostas HTTP da página pública

  Cenário: 200 com corpo pré-serializado e headers de cache
    Dado o service retorna corpo '{"a":1}' e etag 'W/"abc"'
    Quando faço GET sem If-None-Match
    Então o status é 200
    E o corpo é exatamente '{"a":1}'
    E "Cache-Control" é "public, max-age=30, stale-while-revalidate=300"
    E "ETag" é 'W/"abc"'
    E "Content-Type" é "application/json; charset=utf-8"

  Esquema do Cenário: If-None-Match
    Dado o service retorna etag 'W/"abc"'
    Quando faço GET com If-None-Match "<inm>"
    Então o status é <status>

    Exemplos:
      | inm                  | status |
      | W/"abc"              | 304    |
      | "abc"                | 304    |
      | W/"xyz", W/"abc"     | 304    |
      | *                    | 304    |
      | W/"xyz"              | 200    |

  Cenário: 304 sem corpo
    Quando a resposta é 304
    Então o corpo é vazio
    E "ETag" e "Cache-Control" estão presentes

  Cenário: 404 com cache curto
    Dado o service lança RecursoNaoEncontradoError
    Quando faço GET
    Então o status é 404
    E o corpo é { "erro": { "codigo": "RECURSO_NAO_ENCONTRADO", "mensagem": "Página não encontrada." } }
    E "Cache-Control" é "public, max-age=10"
    E não há header "ETag"

  Cenário: rota pública não exige autenticação (RN27)
    Quando faço GET sem header Authorization
    Então o JwtAuthGuard não bloqueia (rota marcada com @Public())
```

### 10.9 Unitários — `LimitesService` (`limites/services/__tests__/limites.service.spec.ts`)

```gherkin
Funcionalidade: Limites por lojista (RNF12)

  Cenário: lojista sem linha de limites
    Dado que não existe linha em lojista_limites para o lojista
    Quando chamo verificarCriacaoFilial
    Então não há erro
    E nenhuma contagem é executada
    E nenhum lock é pedido

  Cenário: coluna nula significa sem limite
    Dado max_filiais = NULL e max_produtos_por_filial = 10
    Quando chamo verificarCriacaoFilial
    Então não há erro
    E nenhuma contagem é executada

  Esquema do Cenário: limite de filiais
    Dado max_filiais = <limite> e <existentes> filiais não excluídas
    Quando chamo verificarCriacaoFilial
    Então <resultado>

    Exemplos:
      | limite | existentes | resultado                              |
      | 3      | 2          | não há erro                            |
      | 3      | 3          | recebo LIMITE_DO_PLANO_ATINGIDO        |
      | 3      | 5          | recebo LIMITE_DO_PLANO_ATINGIDO        |
      | 0      | 0          | recebo LIMITE_DO_PLANO_ATINGIDO        |

  Cenário: filiais excluídas não contam
    Dado max_filiais = 2, 1 filial ativa e 4 excluídas
    Quando chamo verificarCriacaoFilial
    Então não há erro

  Cenário: limite de produtos é por filial
    Dado max_produtos_por_filial = 2
    E a filial F1 com 2 produtos e a filial F2 com 1 produto
    Quando chamo verificarCriacaoProduto para F2
    Então não há erro
    E para F1 recebo LIMITE_DO_PLANO_ATINGIDO

  Cenário: produtos vencidos não excluídos contam
    Dado max_produtos_por_filial = 2 e 2 produtos vencidos não excluídos na filial
    Quando chamo verificarCriacaoProduto
    Então recebo LIMITE_DO_PLANO_ATINGIDO

  Cenário: detalhes do erro
    Quando recebo LIMITE_DO_PLANO_ATINGIDO para "FILIAIS" com limite 3
    Então "detalhes" é { "recurso": "FILIAIS", "limite": 3 }

  Cenário: lock e contagem usam a transação recebida
    Dado um limite configurado
    Quando verifico dentro da transação T
    Então o SELECT ... FOR UPDATE e o count recebem { transaction: T }

  Esquema do Cenário: limite de imagem efetivo
    Dado o limite global de <global> bytes e o do lojista <lojista>
    Quando consulto maxImagemBytes
    Então o resultado é <efetivo>

    Exemplos:
      | global  | lojista | efetivo |
      | 5000000 | NULL    | 5000000 |
      | 5000000 | 2000000 | 2000000 |
      | 5000000 | 9000000 | 5000000 |
      | 5000000 | sem linha | 5000000 |

  Cenário: limite de imagem fica em cache por 30 s
    Quando consulto maxImagemBytes duas vezes em 10 s
    Então o banco é consultado uma vez
```

Nos services das Fases 2–4, acrescentar:

```gherkin
  Cenário: criação de filial respeita o limite (FiliaisService)
    Dado que VerificadorLimites.verificarCriacaoFilial lança LimiteDoPlanoAtingidoError
    Quando o lojista cria uma filial
    Então recebe LIMITE_DO_PLANO_ATINGIDO
    E nenhuma filial é gravada e a transação é revertida

  Cenário: criação de produto respeita o limite (ProdutosService)  # análogo

  Cenário: upload acima do limite do lojista (MidiaService)
    Dado maxImagemBytes = 2000000 e um arquivo de 2500000 bytes
    Quando envio a imagem
    Então recebo IMAGEM_MUITO_GRANDE
    E nada é gravado no storage
```

### 10.10 Unitários — eventos, rate limit, hardening, health e logs

Os cenários de emissão abaixo já são implementados nos specs de cada service nas Fases 2–4 (contrato da Fase 2, 10.3.1). Nesta fase eles servem de checklist de conferência; não duplicar os testes.

```gherkin
Funcionalidade: Emissão de "filial.conteudo-alterado" após commit

  Esquema do Cenário: service emite o evento após o commit
    Dado o <service> com transação mockada
    Quando executo <metodo> com sucesso
    Então o evento é emitido com <payload>
    E só depois do callback afterCommit

    Exemplos:
      | service            | metodo             | payload                  |
      | FiliaisService     | criar              | { tenantId, filialId }   |
      | FiliaisService     | editar             | { tenantId, filialId }   |
      | FiliaisService     | excluir            | { tenantId, filialId }   |
      | PanfletosService   | criar              | { tenantId, filialId }   |
      | PanfletosService   | editarDatas        | { tenantId, filialId }   |
      | PanfletosService   | trocarImagem       | { tenantId, filialId }   |
      | PanfletosService   | excluir            | { tenantId, filialId }   |
      | IdentidadeService  | editar             | { tenantId }             |
      | IdentidadeService  | trocarLogo         | { tenantId }             |
      | CategoriasService  | renomear           | { tenantId, filialId }   |
      | CategoriasService  | excluir            | { tenantId, filialId }   |
      | ProdutosService    | criar              | { tenantId, filialId }   |
      | ProdutosService    | editar             | { tenantId, filialId }   |
      | ProdutosService    | excluir            | { tenantId, filialId }   |
      | ProdutoFotoService | substituir         | { tenantId, filialId }   |
      | ProdutoFotoService | remover            | { tenantId, filialId }   |

  Cenário: falha na transação não emite evento
    Dado que a escrita lança erro e a transação é revertida
    Quando executo o método
    Então o evento não é emitido

  Cenário: criar categoria não emite evento
    Quando crio uma categoria
    Então o evento não é emitido
```

```gherkin
Funcionalidade: Rate limit da rota pública

  Cenário: dentro do limite
    Dado 300 requisições do mesmo IP em 60 s
    Então todas recebem 200 ou 304

  Cenário: acima do limite
    Dado 301 requisições do mesmo IP em 60 s
    Então a 301ª recebe 429 MUITAS_TENTATIVAS com "Retry-After"

  Cenário: IPs diferentes têm cotas independentes
    Dado 300 requisições do IP A e 1 do IP B
    Então a requisição do IP B recebe 200

  Cenário: IP real vem do X-Forwarded-For com trust proxy
    Dado trust proxy = 1 e requisições com X-Forwarded-For "200.1.1.1" e "200.1.1.2"
    Então cada IP tem sua própria cota

  Cenário: limite público não afeta o login
    Dado a cota pública esgotada para um IP
    Quando o mesmo IP faz login
    Então o login segue o throttler "login"
```

```gherkin
Funcionalidade: Hardening HTTP (RNF05)

  Cenário: CORS do painel só para origens permitidas
    Dado CORS_ORIGENS_PAINEL = "https://painel.tabloide.app"
    Quando o preflight de /v1/painel/filiais vem de "https://painel.tabloide.app"
    Então "Access-Control-Allow-Origin" é "https://painel.tabloide.app" e há "Access-Control-Allow-Credentials"
    E quando vem de "https://malicioso.com" não há "Access-Control-Allow-Origin"

  Cenário: CORS público aberto só para leitura
    Quando o preflight de /v1/publico/filiais/x vem de qualquer origem com método GET
    Então "Access-Control-Allow-Origin" é "*" e "Access-Control-Allow-Methods" é "GET, HEAD"
    E não há "Access-Control-Allow-Credentials"

  Cenário: rotas admin sem CORS
    Quando o preflight de /v1/admin/... vem de qualquer origem
    Então não há "Access-Control-Allow-Origin"

  Cenário: headers de segurança
    Quando faço qualquer requisição
    Então há "X-Content-Type-Options: nosniff", "Strict-Transport-Security" e não há "X-Powered-By"

  Cenário: corpo JSON acima do limite
    Quando envio um JSON de 200 KB para uma rota do painel
    Então recebo 413

  Cenário: compressão
    Quando faço GET na página pública com "Accept-Encoding: gzip" e corpo > 1 KB
    Então "Content-Encoding" é "gzip"
```

```gherkin
Funcionalidade: Health check

  Cenário: liveness não depende do banco
    Dado o banco fora do ar
    Quando faço GET /v1/saude/vivo
    Então recebo 200 { "status": "ok" }

  Cenário: readiness com banco disponível
    Quando faço GET /v1/saude/pronto
    Então recebo 200 e "info.banco.status" é "up"

  Cenário: readiness com banco indisponível
    Dado o ping ao banco excede 1 s ou falha
    Quando faço GET /v1/saude/pronto
    Então recebo 503

  Cenário: readiness durante o desligamento
    Dado que o processo recebeu SIGTERM
    Quando faço GET /v1/saude/pronto
    Então recebo 503 mesmo com o banco disponível

  Cenário: health não passa pelo rate limit nem gera log de acesso
    Quando faço 1000 GET /v1/saude/vivo
    Então nenhum recebe 429 e nenhum gera linha de log de acesso
```

```gherkin
Funcionalidade: Logs e métricas

  Esquema do Cenário: dados sensíveis são mascarados
    Dado uma requisição com <campo>
    Quando o log é gerado
    Então o valor aparece como "[REDACTED]"

    Exemplos:
      | campo                            |
      | header Authorization             |
      | header X-Admin-Key               |
      | body.senha                       |
      | body.novaSenha                   |
      | header Cookie                    |

  Cenário: requestId em todas as linhas
    Dado uma requisição com "X-Request-Id: abc"
    Então todas as linhas de log daquela requisição têm "requestId": "abc"
    E a resposta devolve "X-Request-Id: abc"

  Cenário: requestId gerado quando ausente ou inválido
    Dado uma requisição sem "X-Request-Id" ou com valor de 300 caracteres
    Então é gerado um ULID novo

  Cenário: métricas exigem chave de admin
    Quando faço GET /v1/admin/metricas sem X-Admin-Key
    Então recebo 404 RECURSO_NAO_ENCONTRADO
    E com a chave correta recebo o texto Prometheus com "http_request_duration_seconds" e "publico_cache_total"
```

### 10.11 Unitários — graceful shutdown (`main` helpers)

```gherkin
Funcionalidade: Desligamento gracioso

  Cenário: SIGTERM drena as requisições
    Dado uma requisição em andamento de 500 ms
    Quando o processo recebe SIGTERM
    Então a readiness passa a 503
    E a requisição em andamento termina com 200
    E o servidor HTTP fecha e o pool do Sequelize é encerrado
    E o processo sai com código 0 em até SHUTDOWN_TIMEOUT_MS (padrão 10000)
```

### 10.12 Integração (`test/integration/publico/*.int-spec.ts`, Testcontainers + supertest)

Banco real com todas as migrations; `ClockService` sobrescrito com um relógio controlável; `StoragePort` com adapter de disco.

```gherkin
Funcionalidade: Página pública ponta a ponta

  Cenário: filtro real de vigência do panfleto
    Dado panfletos da filial: vencido (01/10–17/10), vigente (18/10–25/10) e agendado (26/10–sem limite)
    E o relógio em 18/10 12:00 São Paulo
    Quando faço GET /v1/publico/filiais/:codigo
    Então "panfleto.validoAte" é "2026-10-25"
    E com o relógio em 26/10 00:00 São Paulo (e cache limpo) "panfleto" é o agendado, sem "validoAte"

  Cenário: panfleto excluído não aparece mesmo vigente
    Dado o panfleto vigente excluído logicamente
    Então "panfleto" é null

  Cenário: filtro real de vigência dos produtos (RN23, RN24)
    Dado produtos: vencido ontem, vence hoje, vigente sem limite, agendado para amanhã, excluído
    Quando faço GET
    Então aparecem só "vence hoje" e "vigente sem limite"

  Cenário: data limite vale até 23:59 do dia no fuso da filial
    Dado um produto com data limite 18/10 em filial de São Paulo
    Então às 23:59:59 de 18/10 (02:59:59Z de 19/10) o produto aparece
    E às 00:00:00 de 19/10 (03:00:00Z) não aparece

  Cenário: produto vigente em categoria excluída não aparece
  Cenário: ordenação pt-BR real com acentos
  Cenário: lojista desativado no banco some após expirar o cache (≤ 60 s simulados)
  Cenário: código de filial excluída responde 404 idêntico ao de código inexistente (compara status, headers relevantes e corpo byte a byte)

  Cenário: ETag/304 ponta a ponta
    Dado um primeiro GET que devolve o ETag E
    Quando faço GET com If-None-Match E
    Então recebo 304
    E depois de editar o preço de um produto pelo painel, o mesmo If-None-Match recebe 200 com ETag novo

  Cenário: invalidação imediata após edição no painel
    Dado a página em cache
    Quando o lojista edita o nome da filial via PATCH /v1/painel/filiais/:id
    Então o próximo GET público já mostra o nome novo

  Cenário: só a consulta 1 usa skipTenantScope
    Dado um spy no hook de tenant
    Quando faço GET público
    Então exatamente 1 consulta é feita com skipTenantScope = true (a de filial por código)
    E as consultas de panfleto e produtos passam pelo hook com tenantId

  Cenário: plano de execução usa os índices
    Dado 5 filiais com 500 produtos cada e ANALYZE executado
    Quando rodo EXPLAIN das consultas 1 e 3 com as configurações padrão do planner
    Então a consulta 1 usa "filiais_codigo_publico_key"
    E a consulta 3 usa "produtos_filial_ativos_idx"
```

```gherkin
Funcionalidade: Limites ponta a ponta (RNF12)

  Cenário: duas criações concorrentes não ultrapassam o limite
    Dado max_filiais = 1 e nenhuma filial
    Quando o lojista dispara 2 POST /v1/painel/filiais em paralelo
    Então exatamente 1 recebe 201 e a outra 409 LIMITE_DO_PLANO_ATINGIDO

  Cenário: migration cria e remove a tabela
    Quando rodo db:migrate e db:migrate:undo da migration de limites
    Então a tabela existe e depois não existe, sem erro
```

### 10.13 Testes de vazamento (RNF04, RNF05)

```gherkin
Funcionalidade: A página pública nunca expõe dados de outro tenant nem identificadores internos

  Contexto:
    Dado o lojista A (ativo) com filial FA, categoria "Bebidas" e produto "Cola A"
    E o lojista B (ativo) com filial FB, categoria "Bebidas" e produto "Cola B"
    E o lojista A com uma segunda filial FA2 e produto "Cola A2"

  Cenário: página de FA só tem dados de FA
    Quando faço GET da página de FA
    Então aparece "Cola A"
    E não aparecem "Cola B" nem "Cola A2"
    E o lojista exibido é A

  Cenário: categorias homônimas de tenants diferentes não se misturam
    Quando faço GET das páginas de FA e de FB
    Então cada "Bebidas" contém só os produtos do seu tenant

  Cenário: produto adulterado com tenant divergente não aparece
    Dado um produto inserido direto no banco com filial_id = FA e tenant_id = B
    Quando faço GET da página de FA
    Então esse produto não aparece (as consultas filtram tenant_id E filial_id)

  Cenário: resposta sem identificadores internos
    Quando faço GET de qualquer página
    Então nenhum UUID do banco aparece no corpo (busca textual por todos os ids de lojistas, filiais, categorias, produtos e panfletos)
    E nenhum path interno de storage aparece fora das URLs públicas

  Cenário: cache não cruza tenants
    Dado as páginas de FA e FB em cache
    Quando o lojista A edita a identidade visual
    Então a página de FB continua igual e com o mesmo ETag

  Cenário: códigos não são enumeráveis por resposta
    Quando faço GET de 100 códigos válidos aleatórios inexistentes
    Então todos recebem o mesmo 404, sem diferença de corpo ou headers
```

### 10.14 Teste de carga (`test/carga/pagina-publica.k6.js`)

Ambiente: `docker compose -f docker-compose.carga.yml up` com API limitada a 1 vCPU e 512 MB, Postgres 16 com 1 vCPU, seed `npm run seed:carga` (50 lojistas ativos, 2 filiais cada, 300 produtos por filial em 15 categorias, 1 panfleto vigente por filial).

```js
import http from 'k6/http';
import { check } from 'k6';
const CODIGOS = JSON.parse(open('./codigos.json'));
export const options = {
  scenarios: {
    quente: { executor: 'constant-arrival-rate', rate: 500, timeUnit: '1s', duration: '2m', preAllocatedVUs: 200 },
  },
  thresholds: {
    'http_req_duration{cenario:quente}': ['p(95)<50', 'p(99)<150'],
    http_req_failed: ['rate<0.001'],
  },
};
export default function () {
  const c = CODIGOS[Math.floor(Math.random() * CODIGOS.length)];
  const r = http.get(`${__ENV.BASE}/v1/publico/filiais/${c}`, { headers: { 'Accept-Encoding': 'gzip' }, tags: { cenario: 'quente' } });
  check(r, { '200': (x) => x.status === 200 });
}
```

| Rodada | Configuração | Meta |
| --- | --- | --- |
| Quente | cache ligado, 500 req/s, 100 códigos | p95 < 50 ms, p99 < 150 ms, erro < 0,1% |
| Fria | `PUBLICO_CACHE_DESATIVADO=true`, 100 req/s | p95 < 200 ms |
| Fila na porta | 1 código, 200 VUs simultâneos começando juntos | 1 carga no banco por TTL (métrica `publico_cache_total{resultado="miss"}`), p95 < 50 ms |
| Payload | 1 página com 300 produtos | JSON ≤ 30 KB com gzip |
| Rate limit | 1 IP acima de 300/min | 429 sem afetar latência dos demais |

O teste de carga não entra no CI. Roda manualmente antes do go-live e a cada mudança nas consultas públicas, e o resultado é anexado ao PR.

---

## 11. Hardening e produção

### 11.1 `main.ts`

```ts
const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));                                  // nestjs-pino
app.set('trust proxy', env.TRUST_PROXY);                         // ex.: 1 (um proxy na frente)
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression({ threshold: 1024 }));
app.useBodyParser('json', { limit: '100kb' });
app.useBodyParser('urlencoded', { limit: '100kb', extended: false });
app.enableCors(corsPorRota(env));                                // ver tabela abaixo
app.setGlobalPrefix('v1');
app.enableShutdownHooks();
const server = await app.listen(env.PORT);
server.requestTimeout = 30_000;     // uploads cabem; requisições presas são cortadas
server.headersTimeout = 15_000;
server.keepAliveTimeout = 65_000;   // maior que o idle timeout do load balancer (60 s)
```

- A API só fala JSON, então a CSP fica desligada (não há HTML a proteger). `crossOriginResourcePolicy: cross-origin` deixa o front em outro domínio ler a página pública.
- HSTS fica ligado (padrão do helmet), e o TLS é encerrado no host (RNF05: tráfego criptografado).
- Os uploads seguem os limites do `multer` da Fase 3, independentes do limite de 100 KB do JSON.

CORS (`corsPorRota`, delegate por `req.path`):

| Prefixo | Origin | Métodos | Credentials |
| --- | --- | --- | --- |
| `/v1/publico` | `*` | GET, HEAD | não |
| `/v1/auth`, `/v1/painel` | allowlist `CORS_ORIGENS_PAINEL` (separadas por vírgula, comparação exata) | GET, POST, PATCH, PUT, DELETE | sim |
| `/v1/admin`, `/v1/saude` | nenhuma (sem CORS) | — | — |

Graceful shutdown (`src/common/observabilidade/desligamento.ts`): no `beforeApplicationShutdown(signal)`, marcar `emDesligamento = true` (readiness 503), esperar `SHUTDOWN_DRENAGEM_MS` (5 s) para o load balancer parar de mandar tráfego, chamar `server.close()` com timeout `SHUTDOWN_TIMEOUT_MS` (10 s) e depois `sequelize.close()`.

### 11.2 Novas variáveis de ambiente (`env.schema.ts`)

| Variável | Exemplo | Obrigatória em prod |
| --- | --- | --- |
| `TRUST_PROXY` | `1` | sim |
| `CORS_ORIGENS_PAINEL` | `https://painel.tabloide.app` | sim |
| `PUBLICO_CACHE_MAX` | `5000` | não |
| `PUBLICO_CACHE_TTL_MAX_SEG` | `60` | não |
| `PUBLICO_CACHE_NEGATIVO_SEG` | `10` | não |
| `PUBLICO_CACHE_DESATIVADO` | `false` | não |
| `PUBLICO_RATE_LIMIT_POR_MIN` | `300` | não |
| `SHUTDOWN_DRENAGEM_MS`, `SHUTDOWN_TIMEOUT_MS` | `5000`, `10000` | não |
| `DATABASE_URL` | pooler transaction (porta 6543) | sim |
| `DATABASE_URL_MIGRATIONS` | session pooler / direta (porta 5432) | sim |
| `DB_SSL` | `require` | sim |
| `LOG_LEVEL` | `info` | não |

O `zod` deve falhar na subida se `NODE_ENV=production` e `CORS_ORIGENS_PAINEL` contiver `*` ou `http://`.

### 11.3 Logs e métricas

- `nestjs-pino` com `genReqId` (aceita `X-Request-Id` de até 64 caracteres `[A-Za-z0-9-]`, senão gera ULID) e o mesmo id no `TenantContext`. O header vai na resposta.
- `redact.paths`: `req.headers.authorization`, `req.headers["x-admin-key"]`, `req.headers.cookie`, `req.body.senha`, `req.body.novaSenha`, `res.headers["set-cookie"]`; `censor: '[REDACTED]'`.
- `autoLogging.ignore`: `/v1/saude/*`. Na rota pública, logar só status ≥ 400 e uma amostra de 1% das 200, para não gerar volume.
- Métricas (`prom-client`, em `/v1/admin/metricas` atrás do `AdminKeyGuard`):
  - `http_request_duration_seconds{metodo,rota,status}`: histograma com buckets `[0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2]`.
  - `publico_cache_total{resultado="hit|miss|negativo|invalidado"}`.
  - `publico_cache_entradas` (gauge).
  - `db_pool_em_uso`, `db_pool_espera` (gauges a partir do pool do Sequelize).
  - Métricas padrão do processo (`collectDefaultMetrics`).

### 11.4 Health check (`src/modules/saude`)

| Rota | Tipo | Verifica | Usada por |
| --- | --- | --- | --- |
| `GET /v1/saude/vivo` | liveness | processo responde | restart do container |
| `GET /v1/saude/pronto` | readiness | `SELECT 1` com timeout de 1 s (`SequelizeHealthIndicator`), e não estar em desligamento | load balancer / deploy rolling |

As duas rotas são `@Public()` e `@SkipThrottle()`.

### 11.5 Dockerfile (multi-stage)

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NODE_OPTIONS="--enable-source-maps"
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./
COPY --chown=node:node .sequelizerc ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3000/v1/saude/vivo').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
```

- A imagem base é `bookworm-slim` (glibc), e não alpine, por causa dos binários pré-compilados de `sharp` e `@node-rs/argon2`.
- As migrations precisam estar compiladas (ou em JS) dentro de `dist/database/migrations`. O `.sequelizerc` aponta para `dist` quando `NODE_ENV=production`.
- `.dockerignore`: `node_modules`, `dist`, `test`, `plans`, `.env*`, `coverage`, `.git`.

### 11.6 Supabase (banco e storage)

| Item | Configuração |
| --- | --- |
| Região | `sa-east-1` (São Paulo), a mesma da API |
| Conexão da API | **Transaction pooler** (Supavisor), porta **6543**, `DATABASE_URL`, SSL `require`. O Sequelize/pg não usa prepared statements nomeados por padrão, o que é compatível com o modo transaction. Pool da API `DB_POOL_MAX=10` por instância |
| Conexão de migrations | **Session pooler ou conexão direta**, porta **5432**, `DATABASE_URL_MIGRATIONS`. DDL, `CREATE EXTENSION` e locks de sessão não funcionam no modo transaction. A conexão direta pode ser só IPv6; se o runner não tiver IPv6, usar o session pooler |
| Extensões | `citext` (Fase 1) e `btree_gist` (Fase 3), criadas pelas próprias migrations com `CREATE EXTENSION IF NOT EXISTS`. Conferir no painel em *Database → Extensions* depois do primeiro deploy |
| Usuário da API | Usar um role próprio (`tabloide_api`) com `GRANT` só nas tabelas do schema `public`, sem acesso a `auth`/`storage`. Migrations rodam com o role dono |
| RLS / API REST do Supabase | A API Node é o único cliente. Desligar a exposição das tabelas pelo PostgREST (remover `public` de *Exposed schemas*) **ou** habilitar RLS sem políticas em todas as tabelas, para que a chave `anon` não leia nada |
| Bucket `midia` | **Público para leitura**, caminhos imutáveis (Fase 3). Escrita só com a `service_role` key, que fica apenas no servidor. Políticas: nenhuma política de INSERT/UPDATE/DELETE para `anon`/`authenticated`; limite de tamanho do bucket = 5 MB (arquivos já processados em WebP, Fase 3); MIME permitido: `image/webp` (a API só grava WebP) |
| Cache de mídia | Upload com `cacheControl: '31536000'` (1 ano; o conteúdo é imutável por path) |

### 11.7 Host da API e disponibilidade (RNF03: 99,5% no horário comercial)

Recomendação: **Fly.io na região `gru` (São Paulo)**, com 2 máquinas `shared-cpu-1x` de 512 MB, `min_machines_running = 2` (sem cold start), health check em `/v1/saude/pronto` e deploy `rolling`. Alternativas equivalentes: Railway ou Render na mesma região. O requisito é ter ≥ 2 instâncias, health check e deploy sem downtime.

- 99,5% ao mês dá cerca de 3 h 36 min de indisponibilidade. Com 2 instâncias e deploy rolling, deploys não derrubam o serviço.
- **Janela de manutenção**: 02:00–05:00 (America/Sao_Paulo), todos os dias, inclusive fins de semana e feriados. Migrations destrutivas e manutenções do Supabase (quando configuráveis) ficam nessa janela.
- Migrations devem ser **compatíveis com a versão anterior do código** (expandir → migrar → contrair), para o deploy rolling funcionar fora da janela.
- Monitoramento externo (ex.: UptimeRobot/Better Stack) em `/v1/saude/pronto` e numa página pública de teste a cada 1 min, com alerta por WhatsApp/e-mail para o administrador.
- Em multi-instância valem as notas de cache (seção 7.3) e de rate limit (seção 8).

### 11.8 CI/CD (GitHub Actions)

`.github/workflows/api-ci.yml` (todo PR e push na `main`, `working-directory: api`):

| Job | Passos | Bloqueia merge |
| --- | --- | --- |
| `qualidade` | `npm ci`, `npm run lint`, `npm run typecheck` (`tsc --noEmit`), `npm audit --omit=dev --audit-level=high` | sim |
| `unitarios` | `npm run test:cov` com gate de cobertura do `jest.config.ts` (90% em `services/` e `domain/`, 80% global); artefato `coverage/` | sim |
| `integracao` | `npm run test:int` (Testcontainers usa o Docker do runner `ubuntu-latest`) | sim |
| `migrations` | service `postgres:16`; `db:migrate` → `db:migrate:undo:all` → `db:migrate` (garante up/down/up) | sim |
| `imagem` | `docker build` (sem push no PR) | sim |

`.github/workflows/api-deploy.yml` (push na `main` depois do CI verde):

1. Build e push da imagem com tag do SHA.
2. `npm run db:migrate` com `DATABASE_URL_MIGRATIONS` (secret), como *release command* antes de trocar as máquinas.
3. Deploy rolling no host.
4. Smoke test: `GET /v1/saude/pronto` = 200 e `GET /v1/publico/filiais/<codigo-de-teste>` = 200.
5. Se o smoke test falhar, rollback para a imagem anterior. Migrations não são revertidas automaticamente; por isso a regra de compatibilidade da seção 11.7.

Secrets: `DATABASE_URL`, `DATABASE_URL_MIGRATIONS`, `JWT_SECRET`, `ADMIN_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_*`. Nunca em `.env` versionado.

### 11.9 Backup (RNF08: diário, retenção de 30 dias)

Os backups automáticos do Supabase variam por plano: em geral, diários com retenção de 7 dias no Pro, e PITR como add-on com janela configurável. **Conferir no plano contratado**: sozinhos, normalmente não cobrem 30 dias. Recomendação: **duas camadas**.

| Camada | O quê | Frequência | Retenção | Onde |
| --- | --- | --- | --- | --- |
| 1. Supabase (nativo) | Backup físico gerenciado (+ PITR, se contratado) | diário | a do plano (ex.: 7 dias) | Supabase |
| 2. Própria (cumpre RNF08) | `pg_dump --format=custom --no-owner` do banco | diário às 03:00 (janela de manutenção) | **30 dias** (regra de ciclo de vida do bucket) | Bucket S3-compatível **fora** do Supabase (ex.: Cloudflare R2), com criptografia (`age` com chave pública; a privada fica fora do CI) |
| 2b. Mídia | `rclone sync` do bucket `midia` com versionamento no destino | diário | 30 dias de versões | Mesmo provedor da camada 2 |

`.github/workflows/api-backup.yml` (`schedule: cron '0 6 * * *'`, 03:00 BRT):

1. Imagem `postgres:16` com o mesmo major do Supabase.
2. `pg_dump "$DATABASE_URL_MIGRATIONS" -Fc -f tabloide-$(date -u +%F).dump`, usando a porta 5432, porque `pg_dump` não funciona no transaction pooler.
3. `age -r $BACKUP_AGE_PUBLIC_KEY` → upload para `s3://tabloide-backups/db/AAAA/MM/DD.dump.age`.
4. `rclone sync supabase:midia r2:tabloide-backups/midia --backup-dir r2:tabloide-backups/midia-versoes/$(date +%F)`.
5. Se falhar, alerta para o administrador (a notificação de falha do workflow por e-mail já basta no MVP).

**Teste de restauração** (`scripts/restaurar-backup.sh` + runbook em `docs/operacao/backup.md`):

- Mensal, no primeiro domingo, de forma manual ou com um workflow `workflow_dispatch`.
- Passos: baixar o dump mais recente, descriptografar, `pg_restore` num Postgres 16 descartável (container), rodar `db:migrate:status` (deve estar em dia) e as consultas de sanidade (contagem de lojistas, filiais, produtos; `SELECT` da página pública de uma filial de teste com o mesmo código da produção), e registrar duração e resultado no runbook.
- Meta: restauração completa em < 1 h (RTO) e perda máxima de 24 h pela camada 2 (RPO); o PITR, se contratado, reduz o RPO.

---

## 12. Preparação para a base de consumidores (só documentação, nada implementado)

RN33, RN34 e RNF11 ficam fora do MVP. O que já foi decidido para não travar a evolução:

- **Modelo previsto**: tabela `consumidores` (`id uuid`, `tenant_id` FK `lojistas`, `nome varchar(120)`, `whatsapp varchar(20)` E.164, `consentimento_em timestamptz NOT NULL`, `consentimento_versao varchar(20) NOT NULL`, `finalidade text NOT NULL`, `descadastrado_em timestamptz NULL`, `created_at`, `updated_at`), `UNIQUE (tenant_id, whatsapp)` e `@TenantScoped`. A base pertence ao lojista e é compartilhada entre as filiais (RN34), por isso **sem** `filial_id`. Uma coluna opcional `origem_filial_id` pode registrar onde a pessoa se cadastrou.
- **Funcionalidade por lojista**: liberar via `lojista_ativacoes.funcionalidades` (`{ "consumidores": true }`), como prevê o RN04.
- **Rota pública futura**: `POST /v1/publico/filiais/:codigo/consumidores`, com rate limit mais rígido que a leitura e o mesmo 404 para lojista inativo.
- **Nota LGPD (RNF11)**: toda exclusão no sistema é lógica (RN25), mas o titular pode pedir **eliminação** dos dados (art. 18, VI, LGPD). Duas opções para decidir com o advogado antes de implementar:
  1. **Eliminação física** (`DELETE` real) da linha do consumidor: a única exceção à RN25, registrada como tal.
  2. **Anonimização irreversível**: substituir `nome` e `whatsapp` por valores sem relação com a pessoa (ex.: hash com salt descartado), mantendo a linha para estatística.

  Nos dois casos, os **backups** (seção 11.9) mantêm a cópia por até 30 dias. A política de privacidade deve informar isso, e uma restauração deve reaplicar os pedidos de eliminação registrados (manter uma tabela `pedidos_eliminacao` só com o hash do WhatsApp). Nada disso entra no MVP.

---

## 13. Checklist de pronto da Fase 5

- [ ] Todos os cenários das seções 10.1–10.13 implementados e passando.
- [ ] Gate de cobertura atendido (90% em `services/`/`domain/`, 80% global).
- [ ] Migration `lojista_limites` aplica e reverte do zero.
- [ ] `LimitesService` substituiu o `SemLimitesVerificador` no token `VERIFICADOR_LIMITES`, com os 3 pontos de chamada testados.
- [ ] Evento `filial.conteudo-alterado` emitido após commit em todos os métodos da tabela 7.3, com testes.
- [ ] A página pública responde 404 idêntico nos 5 casos (formato inválido, inexistente, filial excluída, aguardando, desativado).
- [ ] Varredura de chaves e UUIDs na resposta pública passando (10.5 e 10.13).
- [ ] EXPLAIN das consultas 1 e 3 usando os índices esperados (10.12).
- [ ] Teste de carga executado, resultado anexado ao PR e metas atingidas (10.14).
- [ ] Helmet, CORS por rota, compression, trust proxy, limites de body, timeouts e graceful shutdown ativos e testados.
- [ ] `/v1/saude/vivo` e `/v1/saude/pronto` funcionando; métricas em `/v1/admin/metricas` atrás da chave.
- [ ] Redaction de logs verificada.
- [ ] Dockerfile gera imagem que sobe com `NODE_ENV=production` e roda migrations a partir de `dist`.
- [ ] Workflows `api-ci`, `api-deploy` e `api-backup` criados e verdes.
- [ ] Coleção Postman/`.http` atualizada: rota pública (200/304/404/429), saúde e métricas.

## 14. Checklist de go-live

**Supabase**
- [ ] Projeto em `sa-east-1` e plano com backup diário ativo (conferir retenção e PITR).
- [ ] Extensões `citext` e `btree_gist` habilitadas.
- [ ] Role `tabloide_api` com privilégios mínimos; `DATABASE_URL` no transaction pooler (6543) e `DATABASE_URL_MIGRATIONS` na porta 5432, ambos com SSL.
- [ ] Schema `public` não exposto pelo PostgREST ou RLS ligado sem políticas; teste com a chave `anon` retornando nada.
- [ ] Bucket `midia` público para leitura, sem políticas de escrita para `anon`/`authenticated`, com limite de tamanho e MIME `image/webp`.

**API**
- [ ] 2 instâncias na região de São Paulo, health check de readiness e deploy rolling.
- [ ] Todas as variáveis de ambiente de produção definidas e validadas pelo `zod`; `CORS_ORIGENS_PAINEL` só com HTTPS.
- [ ] `JWT_SECRET` e `ADMIN_KEY` com pelo menos 32 bytes aleatórios, diferentes dos de dev e guardados só nos secrets do host/CI.
- [ ] TLS válido no domínio da API; HSTS ativo.
- [ ] `TRUST_PROXY` conferido: o IP real aparece nos logs.

**Operação**
- [ ] Monitor externo a cada 1 min com alerta para o administrador.
- [ ] Primeiro backup da camada 2 concluído e **restaurado com sucesso** num ambiente descartável.
- [ ] Runbook em `docs/operacao/` com: ativar/desativar lojista no banco (RN03), redefinir senha via Postman (RN36), configurar limites (RNF12), restaurar backup e fazer rollback de deploy.
- [ ] Janela de manutenção (02:00–05:00 BRT) comunicada.
- [ ] Teste real: imprimir um QR Code de uma filial de teste, abrir num celular em 4G, conferir carregamento ≤ 3 s, zoom no panfleto e "válido até dd/mm"; desativar o lojista no banco e conferir que a página some em ≤ 90 s.
- [ ] Confirmação jurídica pendente registrada: RNF07 (CDC) e, para a versão futura, RNF11 (LGPD).
