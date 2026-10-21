# Fase 3 — Mídia, panfleto e identidade visual

Pré-leitura obrigatória: `00-visao-geral.md`, com stack, MVC, convenções, modelo de dados, contrato de erros e estratégia de testes. Este plano não repete esses pontos, só os referencia.

## 1. Objetivo

Entregar o pipeline de imagens (validação, otimização e armazenamento), o cadastro de **panfleto** por filial com garantia de não sobreposição de períodos (RN13–RN17) e a **identidade visual** do lojista (RN06). Ao fim da fase, o lojista consegue publicar e agendar panfletos e definir logo e cores pelo painel. Esses dados ficam prontos para a página pública da Fase 5.

## 2. Escopo

| Dentro | Fora (fase) |
| --- | --- |
| Módulo `midia`: `StoragePort`, `SupabaseStorageAdapter`, `DiskStorageAdapter`, `ImageProcessor`, interceptor de upload | Foto de produto, que usa o perfil `produto` deste módulo (Fase 4) |
| Perfis de imagem `panfleto`, `produto` e `logo` | Remoção física de arquivos e job de limpeza de órfãos (pós-MVP) |
| Panfleto: criar, listar, detalhar, editar datas, trocar imagem, excluir logicamente | Entrega do panfleto vigente à página pública (Fase 5) |
| Validação de sobreposição em serviço, com lock por filial e `EXCLUDE` no banco | Limites por plano (RNF12, Fase 5; aqui só o teto técnico de bytes) |
| Auditoria de datas e da imagem do panfleto | Cache e CDN da página pública (Fase 5) |
| Identidade visual: nome fantasia, cores e logo | |
| Handler de cascata da filial para panfletos | |

## 3. Pré-requisitos (entregues nas Fases 1 e 2)

- `JwtAuthGuard`, `TenantStatusGuard` (escrita bloqueada para `DESATIVADO`), `@TenantId()`, `AppExceptionFilter`, trava `@TenantScoped` e `ClockService`.
- Model `Lojista` com `logo_path`, `cor_primaria` e `cor_secundaria`, e `CHECK` de cor.
- Model `Filial` com `fusoHorario`, e `hojeNoFuso(fuso, agora)` em `common/utils/date-only.ts`.
- Módulo `vigencia`: `calcularSituacao`, `validarCriacao` (= `resolverDataInicio` + `validarDatas`; RN40, RN42 e D5 → `DATA_INICIO_INVALIDA`), `validarEdicaoDeDatas(atual, novas, hoje)` (RN26) e `periodosSeSobrepoem`. Todas devolvem `ResultadoValidacao` e o service converte em `AppError`.
- `AuditoriaService.registrarCriacao(...)` e `registrarAlteracoes(tenantId, entidade, entidadeId, antes, depois, camposAuditados, { transaction })`, com `CAMPOS_AUDITADOS.PANFLETO = ['dataInicio','dataLimite','imagemPath']` e entidade `'PANFLETO'`.
- `ExclusaoEmCascataFilialRegistry` (exportado pelo `FiliaisModule`) e interface `ExclusaoEmCascataFilial` (`nome`, `ordem`, `excluirPorFilial`). Panfletos usam `ordem = 30`.
- `VERIFICADOR_LIMITES` (`VerificadorLimites.maxImagemBytes(tenantId)`), com `SemLimitesVerificador` até a Fase 5.
- `EVENTO_CONTEUDO_ALTERADO` (`'filial.conteudo-alterado'`) e `ConteudoAlteradoEvento { tenantId, filialId? }`, em `common/eventos`, emitido após o commit.

## 4. Decisões desta fase

| # | Decisão | Justificativa |
| --- | --- | --- |
| D3.1 | **HEIC/HEIF não é aceito no MVP**; só JPEG, PNG e WebP | O binário pré-compilado do `sharp` não decodifica HEIC (licença de patentes do HEVC), e compilar libvips com libheif complica o build e a imagem Docker. Navegadores do iOS convertem para JPEG ao anexar foto num `<input type="file" accept="image/jpeg,image/png,image/webp">`. Pode ser revisto se o suporte reclamar. |
| D3.2 | Trocar a imagem de um panfleto **VIGENTE ou AGENDADO é permitido** (`PUT .../imagem`) e **é auditado** (campo `imagemPath`) | RN26 permite editar vigentes e agendados. A imagem do panfleto **contém os preços** divulgados; pelo mesmo motivo do RNF07 (CDC), a troca precisa de rastro. |
| D3.3 | Ordem de criação: processar imagem → abrir transação → lock da filial → validar regras → enviar ao storage → inserir → commit | Validar antes do upload evita arquivos órfãos no caso comum (conflito de período). O lock fica preso durante o upload (~100–300 ms), o que é aceitável porque só serializa escritas de panfleto na **mesma filial**. |
| D3.4 | Arquivo órfão (upload ok, mas commit falhou): **não é apagado**, gera log `warn` com `evento: "midia.arquivo_orfao"` e o caminho | A exclusão lógica (RN25) já mantém arquivos; o `StoragePort` não tem remoção física. Um job de limpeza pode ser feito pós-MVP a partir desses logs ou de um diff bucket × banco. |
| D3.5 | Novo código de erro `ARMAZENAMENTO_INDISPONIVEL` (HTTP 503) | Falha do storage não é erro do lojista e precisa ser distinguível de `ERRO_INTERNO` para alertas. Será incluído no catálogo da visão geral. |
| D3.6 | `dataInicio` anterior a hoje (no fuso da filial) é recusada com `422 DATA_INICIO_INVALIDA` (campo `dataInicio`), pela própria `validarCriacao`/`validarEdicaoDeDatas` da Fase 2 (D5 de lá). Nenhuma validação extra nesta fase | Cadastrar é publicar (RN40); um início no passado não tem efeito prático e só polui a verificação de sobreposição. |
| D3.7 | `dataLimite: null` explícito no PATCH **remove** a data limite; campo ausente mantém o valor atual | Diferencia "não mexer" de "deixar sem limite". A sobreposição é revalidada. |
| D3.8 | Processamento de imagem limitado a **2 execuções simultâneas por instância** (semáforo `p-limit`) e `sharp.concurrency(1)` por execução | Protege memória e CPU do container. Upload é raro em comparação com a leitura pública. |
| D3.9 | A **criação** do panfleto grava auditoria (`registrarCriacao`, valor anterior nulo) de `dataInicio`, `dataLimite` e `imagemPath` | Segue a D6 da Fase 2: prova da oferta desde o primeiro minuto |
| D3.10 | `PanfletosService` (criar, editarDatas, trocarImagem, excluir) emite `filial.conteudo-alterado` com `{ tenantId, filialId }` após o commit; `IdentidadeService` (editar, trocarLogo) emite com `{ tenantId }` (sem `filialId`: afeta todas as filiais) | Contrato único da Fase 2 (10.3.1), consumido pelo cache da Fase 5 |

## 5. Configuração (`config/env.schema.ts`, acréscimos)

| Variável | Tipo | Padrão | Uso |
| --- | --- | --- | --- |
| `STORAGE_DRIVER` | `'supabase' \| 'disco'` | `disco` em dev/test; **obrigatório `supabase` em production** (o zod recusa `disco` com `NODE_ENV=production`) | Escolhe o adapter |
| `SUPABASE_URL` | url | — (obrigatório se driver `supabase`) | |
| `SUPABASE_SERVICE_ROLE_KEY` | string | — (obrigatório se driver `supabase`) | Só no servidor; nunca logado |
| `SUPABASE_BUCKET` | string | `midia` | Bucket **público** de leitura |
| `MIDIA_DIR_LOCAL` | path | `./.midia` | Raiz do `DiskStorageAdapter` |
| `MIDIA_URL_BASE_LOCAL` | url | `http://localhost:3000/v1/midia-local` | Base de `urlPublica` no driver `disco` |
| `MAX_IMAGEM_BYTES` | int | `10485760` (10 MB) | Teto **antes** do processamento (RNF05). RNF12 por lojista entra na Fase 5 |
| `IMAGEM_MAX_PIXELS` | int | `50000000` (50 MP) | `limitInputPixels` do sharp (anti decompression bomb) |
| `IMAGEM_CONCORRENCIA` | int | `2` | Semáforo da D3.8 |

Perfis em `modules/midia/domain/perfis-imagem.ts`, como constantes, sem número mágico espalhado:

| Perfil | Lado maior máx. | Qualidade WebP | `effort` | Observação |
| --- | --- | --- | --- | --- |
| `panfleto` | 2400 px | 80 | 4 | Resolução suficiente para zoom de pinça (RNF01) |
| `produto` | 800 px | 78 | 4 | Usado na Fase 4 |
| `logo` | 512 px | 85 | 4 | Mantém transparência (alpha) |

## 6. Passo a passo

1. **Dependências**: `sharp`, `file-type@16.5.4` (última versão CommonJS; evita `import()` dinâmico num projeto Nest CJS), `@supabase/supabase-js`, `p-limit@3` (CJS), `@nestjs/serve-static`, `@types/multer`.
2. **Config**: acrescentar as variáveis da seção 5 ao `env.schema.ts`, com a regra condicional do driver.
3. **Domínio de mídia** (`modules/midia/domain/`): `perfis-imagem.ts`, `tipos-aceitos.ts` (`['image/jpeg','image/png','image/webp']`), `caminho-midia.ts` (`montarCaminho(tenantId, tipo)`).
4. **`StoragePort`** (`modules/midia/storage/storage.port.ts`) e token `STORAGE_PORT`.
5. **`DiskStorageAdapter`** e **`SupabaseStorageAdapter`** (`modules/midia/storage/`).
6. **`ImageProcessor`** (`modules/midia/services/image-processor.service.ts`).
7. **`MidiaService`** (`modules/midia/services/midia.service.ts`): fachada `processarESalvar` é **dividida** em `processar()` e `salvar()`, porque o panfleto precisa validar entre as duas (D3.3).
8. **Interceptor de upload** (`modules/midia/interceptors/upload-imagem.interceptor.ts`): `FileInterceptor('imagem', { storage: memoryStorage(), limits })`, com tradução dos erros do multer.
9. **`MidiaModule`**: provider dinâmico do `STORAGE_PORT` por `STORAGE_DRIVER`; `ServeStaticModule` registrado **somente** se `NODE_ENV === 'development'`.
10. **Erros novos** no catálogo: `ARMAZENAMENTO_INDISPONIVEL`; garantir o mapeamento de `IMAGEM_INVALIDA`, `IMAGEM_MUITO_GRANDE`, `PANFLETO_PERIODO_SOBREPOSTO` e `PANFLETO_ATUAL_SEM_DATA_LIMITE`; mapear `23P01` com constraint `panfletos_periodo_sem_sobreposicao` → `PANFLETO_PERIODO_SOBREPOSTO`.
11. **Migration** `20261101000000-criar-panfletos.js` (seção 7).
12. **Model** `Panfleto` (seção 8).
13. **Domínio do panfleto** (`modules/panfletos/domain/conflito-periodo.ts`): função pura `encontrarConflito`. **Filtro de situação** compartilhado (`modules/vigencia/consultas/filtro-situacao.ts`): `condicaoAgendado(hoje)`, `condicaoVigente(hoje)`, `condicaoVencido(hoje)` e `filtroSituacao(situacoes, hoje) → { where, paranoid }`, criado nesta fase no módulo `vigencia` porque a Fase 4 (produtos e contagens de categorias) reaproveita.
14. **`PanfletosService`**, **`PanfletoView`**, DTOs e **`PanfletosController`**.
15. **`PanfletosExclusaoCascata`** (`nome = 'panfletos'`, `ordem = 30`) registrado no `ExclusaoEmCascataFilialRegistry` em `PanfletosModule.onModuleInit()`, no padrão da Fase 2 (10.2).
16. **Identidade visual**: `IdentidadeService`, `IdentidadeView`, `EditarIdentidadeDto`, `IdentidadeController` dentro de `modules/lojistas`.
17. Testes unitários (seção 13), testes de integração (seção 14), arquivo `.http`/Postman da fase.

## 7. Migration

`src/database/migrations/20261101000000-criar-panfletos.js`

```sql
-- up
-- No Supabase as extensões ficam no schema "extensions"; localmente, no public.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE panfletos (
  id              uuid PRIMARY KEY,
  tenant_id       uuid        NOT NULL REFERENCES lojistas(id),
  filial_id       uuid        NOT NULL REFERENCES filiais(id),
  imagem_path     text        NOT NULL,
  imagem_largura  integer     NOT NULL CHECK (imagem_largura > 0),
  imagem_altura   integer     NOT NULL CHECK (imagem_altura > 0),
  data_inicio     date        NOT NULL,
  data_limite     date        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz NULL,
  CONSTRAINT panfletos_datas_validas
    CHECK (data_limite IS NULL OR data_limite >= data_inicio)
);

-- RN16: rede de segurança contra corrida; daterange com limite superior NULL = infinito.
-- '[]' inclui os dois extremos: terminar e começar no mesmo dia é sobreposição (RN24).
ALTER TABLE panfletos
  ADD CONSTRAINT panfletos_periodo_sem_sobreposicao
  EXCLUDE USING gist (
    filial_id WITH =,
    daterange(data_inicio, data_limite, '[]') WITH &&
  ) WHERE (deleted_at IS NULL);

-- Consulta do painel (lista por filial) e da página pública (vigente da filial)
CREATE INDEX panfletos_filial_inicio_ativos
  ON panfletos (filial_id, data_inicio DESC) WHERE deleted_at IS NULL;
CREATE INDEX panfletos_tenant ON panfletos (tenant_id);

-- down
DROP TABLE panfletos;
-- A extensão btree_gist não é removida no down (pode ser usada por outras tabelas).
```

Observação Supabase: `CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;` (o schema `extensions` está no `search_path` padrão). A migration detecta o ambiente pela variável `DB_EXTENSIONS_SCHEMA` (padrão vazio = schema padrão).

O índice GiST criado pelo `EXCLUDE` também atende consultas de sobreposição por filial. O índice B-tree parcial atende o `ORDER BY data_inicio DESC`.

## 8. Model

`modules/panfletos/models/panfleto.model.ts`

```ts
@TenantScoped()
@Table({ tableName: 'panfletos', underscored: true, paranoid: true })
export class Panfleto extends Model<PanfletoAttrs, PanfletoCriacaoAttrs> {
  @PrimaryKey @Default(() => uuidv7()) @Column(DataType.UUID) declare id: string;
  @ForeignKey(() => Lojista) @Column(DataType.UUID) declare tenantId: string;
  @ForeignKey(() => Filial)  @Column(DataType.UUID) declare filialId: string;
  @Column(DataType.TEXT)     declare imagemPath: string;
  @Column(DataType.INTEGER)  declare imagemLargura: number;
  @Column(DataType.INTEGER)  declare imagemAltura: number;
  @Column(DataType.DATEONLY) declare dataInicio: DataISO;
  @Column(DataType.DATEONLY) declare dataLimite: DataISO | null;
  @BelongsTo(() => Filial)   declare filial?: Filial;
  declare deletedAt: Date | null;
}
```

`DATEONLY` retorna string `YYYY-MM-DD` no Sequelize 6, o que é compatível com `DataISO`. Não usar `get()` customizado.

## 9. DTOs (multipart e JSON)

Em multipart, todos os campos chegam como string. Campo vazio (`""`) é transformado em `undefined` por um `@Transform` compartilhado (`vazioParaUndefined`).

### `CriarPanfletoDto` (multipart, campos texto)

| Campo | Obrigatório | Validação | Erro |
| --- | --- | --- | --- |
| `imagem` (arquivo) | Sim | Exatamente 1 arquivo no campo `imagem`; validado no interceptor e no `ImageProcessor` | `VALIDACAO_INVALIDA` (ausente), `IMAGEM_MUITO_GRANDE`, `IMAGEM_INVALIDA` |
| `dataInicio` | Não | `@IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDataCalendarioValida()` (rejeita `2026-02-30`) | `VALIDACAO_INVALIDA` |
| `dataLimite` | Não | Igual a `dataInicio` | `VALIDACAO_INVALIDA` |

Campos extras são recusados (`forbidNonWhitelisted`). As regras RN40/RN42/RN16/RN17 rodam no service, porque dependem do fuso da filial e do banco.

### `EditarDatasPanfletoDto` (JSON)

| Campo | Obrigatório | Validação |
| --- | --- | --- |
| `dataInicio` | Não | Formato `YYYY-MM-DD` válido; `null` **não** é permitido (início é sempre preenchido, RN40) |
| `dataLimite` | Não | Formato válido **ou** `null` explícito (D3.7). `@ValidateIf(o => o.dataLimite !== null)` |
| — | — | Pelo menos um dos dois presente (`@AlgumCampoPresente(['dataInicio','dataLimite'])`), senão `VALIDACAO_INVALIDA` |

### `ListarPanfletosQueryDto`

| Campo | Padrão | Validação |
| --- | --- | --- |
| `situacao` | todas, exceto `EXCLUIDO` | Lista CSV de `AGENDADO,VIGENTE,VENCIDO,EXCLUIDO` |
| `pagina` / `porPagina` | 1 / 50 | Conforme a visão geral (máx. 100) |

### `EditarIdentidadeDto` (JSON)

| Campo | Obrigatório | Validação |
| --- | --- | --- |
| `nomeFantasia` | Não | `trim`, 2–120 caracteres |
| `corPrimaria` | Não | `/^#[0-9a-fA-F]{6}$/`, normalizada para maiúsculas, **ou** `null` (remove) |
| `corSecundaria` | Não | Idem |
| — | — | Pelo menos um campo presente |

### Interceptor de upload

```ts
FileInterceptor('imagem', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_IMAGEM_BYTES, files: 1, fields: 5, fieldSize: 1024, parts: 7 },
})
```

| Erro do multer | Tradução |
| --- | --- |
| `LIMIT_FILE_SIZE` | `413 IMAGEM_MUITO_GRANDE` (`detalhes.maxBytes`) |
| `LIMIT_FILE_COUNT`, `LIMIT_UNEXPECTED_FILE` | `400 VALIDACAO_INVALIDA` (campo `imagem`) |
| `LIMIT_FIELD_*`, `LIMIT_PART_COUNT` | `400 VALIDACAO_INVALIDA` |

O `Content-Type` declarado pelo cliente (`file.mimetype`) é **ignorado**. Só os magic bytes valem (RNF05).

## 10. Rotas

Todas exigem JWT. Escritas passam pelo `TenantStatusGuard` (desativado → `403 LOJISTA_DESATIVADO`). Uma filial inexistente, excluída ou de outro tenant gera `404 RECURSO_NAO_ENCONTRADO`.

### 10.1 Panfletos

| Método e rota | Corpo | Sucesso | Erros |
| --- | --- | --- | --- |
| `POST /v1/painel/filiais/:filialId/panfletos` | multipart: `imagem`, `dataInicio?`, `dataLimite?` | `201` + `PanfletoView` | 400, 404, 409 (`PANFLETO_PERIODO_SOBREPOSTO`, `PANFLETO_ATUAL_SEM_DATA_LIMITE`), 413, 422 (`IMAGEM_INVALIDA`, `DATA_LIMITE_INVALIDA`), 503 |
| `GET /v1/painel/filiais/:filialId/panfletos` | query `ListarPanfletosQueryDto` | `200` + página de `PanfletoView` | 400, 404 |
| `GET /v1/painel/filiais/:filialId/panfletos/:id` | — | `200` + `PanfletoView` (inclui excluído, para consulta) | 404 |
| `PATCH /v1/painel/filiais/:filialId/panfletos/:id` | JSON `EditarDatasPanfletoDto` | `200` + `PanfletoView` | 400, 404, 409 (`ITEM_NAO_EDITAVEL`, `DATA_INICIO_IMUTAVEL`, sobreposição), 422 |
| `PUT /v1/painel/filiais/:filialId/panfletos/:id/imagem` | multipart: `imagem` | `200` + `PanfletoView` | 404, 409 `ITEM_NAO_EDITAVEL`, 413, 422, 503 |
| `DELETE /v1/painel/filiais/:filialId/panfletos/:id` | — | `204` | 404 (inclusive se já excluído) |

Exemplo de criação:

```http
POST /v1/painel/filiais/0192f0a4-…/panfletos
Authorization: Bearer …
Content-Type: multipart/form-data; boundary=X

--X
Content-Disposition: form-data; name="imagem"; filename="folheto.jpg"
Content-Type: image/jpeg

<bytes>
--X
Content-Disposition: form-data; name="dataLimite"

2026-10-31
--X--
```

```json
HTTP/1.1 201 Created
{
  "id": "0192f0b1-…",
  "filialId": "0192f0a4-…",
  "urlImagem": "https://xyz.supabase.co/storage/v1/object/public/midia/0192…/panfleto/0192f0b1-….webp",
  "largura": 1697,
  "altura": 2400,
  "dataInicio": "2026-10-18",
  "dataLimite": "2026-10-31",
  "situacao": "VIGENTE",
  "editavel": true,
  "criadoEm": "2026-10-18T15:02:11.000Z",
  "excluidoEm": null
}
```

Exemplo de conflito RN17:

```json
HTTP/1.1 409 Conflict
{ "erro": {
  "codigo": "PANFLETO_ATUAL_SEM_DATA_LIMITE",
  "mensagem": "O panfleto atual não tem data limite. Defina uma data limite para ele antes de agendar o próximo.",
  "detalhes": { "conflitoCom": { "id": "0192…", "dataInicio": "2026-10-01", "dataLimite": null } }
} }
```

### 10.2 Identidade visual (RN06)

| Método e rota | Corpo | Sucesso | Erros |
| --- | --- | --- | --- |
| `GET /v1/painel/lojista/identidade` | — | `200` + `IdentidadeView` | 401 |
| `PATCH /v1/painel/lojista/identidade` | JSON `EditarIdentidadeDto` | `200` + `IdentidadeView` | 400, 403 |
| `PUT /v1/painel/lojista/logo` | multipart: `imagem` | `200` + `IdentidadeView` | 400, 403, 413, 422, 503 |

```json
{ "nomeFantasia": "Mercado Bom Preço", "corPrimaria": "#C8102E", "corSecundaria": "#FFD100",
  "urlLogo": "https://…/midia/0192…/logo/0192f…webp" }
```

As dimensões do logo não são persistidas nem expostas: ele sempre cabe em 512 px, e o front reserva um quadrado com `object-fit: contain`.

### 10.3 Mídia local (somente development)

`GET /v1/midia-local/*` via `ServeStaticModule` (`rootPath: MIDIA_DIR_LOCAL`, `serveRoot: '/v1/midia-local'`, `maxAge: 31536000000`, `immutable: true`). Em `test` e `production`, o módulo não é registrado (um teste garante isso).

## 11. Views

### `PanfletoView.de(panfleto, hoje, storage)`

| Campo | Origem |
| --- | --- |
| `id`, `filialId` | model |
| `urlImagem` | `storage.urlPublica(imagemPath)`: função pura, sem rede |
| `largura`, `altura` | `imagemLargura`, `imagemAltura` (para o front reservar espaço e evitar layout shift, RNF02) |
| `dataInicio`, `dataLimite` | `YYYY-MM-DD` / `null` |
| `situacao` | `calcularSituacao(panfleto, hoje)` |
| `editavel` | `situacao === 'AGENDADO' \|\| situacao === 'VIGENTE'` |
| `criadoEm`, `excluidoEm` | ISO 8601 |

`imagemPath` **não** é exposto. `hoje` é calculado **uma vez por request** pelo service (`hojeNoFuso(filial.fusoHorario, clock.agora())`) e passado à view; na listagem, nunca uma vez por item.

### `IdentidadeView.de(lojista, storage)`

`nomeFantasia`, `corPrimaria`, `corSecundaria`, `urlLogo` (`null` se sem logo).

## 12. Services

### 12.1 `StoragePort`

```ts
export interface StoragePort {
  /** Grava sem sobrescrever. Lança ArmazenamentoIndisponivelError em falha de infraestrutura. */
  salvar(conteudo: Buffer, caminho: string, contentType: 'image/webp'): Promise<void>;
  /** Pura: monta a URL pública, sem chamada de rede. */
  urlPublica(caminho: string): string;
}
export const STORAGE_PORT = Symbol('STORAGE_PORT');
```

Não existe `remover` (D3.4, RN25).

### 12.2 `SupabaseStorageAdapter`

- Construtor: `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })`, uma instância por processo.
- `salvar`: `storage.from(bucket).upload(caminho, conteudo, { contentType, cacheControl: '31536000', upsert: false })`.
  - Erro com status 5xx ou de rede: **1 nova tentativa** após 200 ms; persistindo, `ArmazenamentoIndisponivelError` (→ `503 ARMAZENAMENTO_INDISPONIVEL`).
  - Erro `409`/`Duplicate` (caminho já existe, o que é praticamente impossível com UUID v7): `ErroInterno` com log `error`, sem retry.
  - Erros 4xx restantes (bucket inexistente, chave inválida): `ErroInterno` com log `error` (configuração), sem retry.
- `urlPublica`: `` `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${caminho}` ``, com cada segmento passado por `encodeURIComponent`. Não usa `getPublicUrl` para não depender do client em testes.
- O bucket `midia` é criado manualmente (público, `file_size_limit` 5 MB, `allowed_mime_types` `['image/webp']`) e documentado no README de deploy (Fase 5). Isso é defesa extra: o bucket só aceita o que o processador produz.

### 12.3 `DiskStorageAdapter`

- `salvar`: resolve `path.resolve(raiz, caminho)` e **garante que o resultado começa com `raiz + path.sep`** (contra path traversal, senão `ErroInterno`); `mkdir -p` do diretório; `writeFile(..., { flag: 'wx' })` (não sobrescreve).
- `urlPublica`: `` `${MIDIA_URL_BASE_LOCAL}/${caminho}` ``.

### 12.4 `ImageProcessor`

```ts
type PerfilImagem = 'panfleto' | 'produto' | 'logo';
interface ImagemProcessada { conteudo: Buffer; largura: number; altura: number; contentType: 'image/webp'; bytes: number }

processar(entrada: Buffer, perfil: PerfilImagem): Promise<ImagemProcessada>
```

Algoritmo:

1. `entrada.length === 0` → `IMAGEM_INVALIDA`. `entrada.length > MAX_IMAGEM_BYTES` → `IMAGEM_MUITO_GRANDE` (defesa caso o interceptor seja contornado).
2. `fromBuffer(entrada)` (file-type): `mime` fora de `tipos-aceitos` ou `undefined` → `IMAGEM_INVALIDA` (`detalhes.tiposAceitos`).
3. Dentro do semáforo (`p-limit(IMAGEM_CONCORRENCIA)`):
   `sharp(entrada, { limitInputPixels: IMAGEM_MAX_PIXELS, failOn: 'error', pages: 1, sequentialRead: true })`
   `.rotate()` (aplica a orientação EXIF)
   `.resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })`
   `.webp({ quality, effort, alphaQuality: 100 })`
   `.toBuffer({ resolveWithObject: true })`
   Os metadados (EXIF, GPS, ICC) **não** são copiados, porque o padrão do sharp descarta sem `withMetadata()`. Isso protege a privacidade e reduz bytes.
4. Erro do sharp contendo `pixel limit` → `IMAGEM_MUITO_GRANDE` (`detalhes.motivo: 'dimensoes'`); qualquer outro erro do sharp (arquivo corrompido ou truncado) → `IMAGEM_INVALIDA`.
5. Retorna `{ conteudo: data, largura: info.width, altura: info.height, contentType: 'image/webp', bytes: info.size }`.
6. Log `debug` com perfil, bytes de entrada e saída e duração em ms (métrica para RNF02).

`sharp.cache(false)` no bootstrap do módulo: sem cache de operações, porque cada imagem é processada uma vez só e o cache só gastaria memória.

### 12.5 `MidiaService`

```ts
processar(tenantId: string, entrada: Buffer, perfil: PerfilImagem): Promise<ImagemProcessada> // checa VerificadorLimites.maxImagemBytes(tenantId) e delega ao ImageProcessor
salvar(tenantId: string, perfil: PerfilImagem, imagem: ImagemProcessada): Promise<string /* caminho */>
urlPublica(caminho: string | null): string | null
```

`processar`: `if (entrada.length > await limites.maxImagemBytes(tenantId)) throw IMAGEM_MUITO_GRANDE (413, detalhes.maxBytes)` antes de chamar o `ImageProcessor` (RNF12; com `SemLimitesVerificador` o teto é `MAX_IMAGEM_BYTES`). `MidiaService` é a **única** porta de entrada de imagem para as Fases 3 e 4; ninguém chama `ImageProcessor` ou `StoragePort.salvar` diretamente.

`montarCaminho(tenantId, perfil)` = `` `${tenantId}/${perfil}/${uuidv7()}.webp` ``. O caminho é imutável: um conteúdo novo gera um arquivo novo, e a CDN pode cachear por 1 ano.

### 12.6 Domínio: `encontrarConflito` (puro)

`modules/panfletos/domain/conflito-periodo.ts`

```ts
interface Periodo { id?: string; dataInicio: DataISO; dataLimite: DataISO | null }
type Conflito = { tipo: 'SEM_DATA_LIMITE' | 'SOBREPOSTO'; com: Periodo } | null;

function encontrarConflito(novo: Periodo, existentes: Periodo[], ignorarId?: string): Conflito
```

1. Filtra `existentes` sem `ignorarId` (edição) e mantém os que satisfazem `periodosSeSobrepoem(novo, e)` (Fase 2: intervalos fechados, `null` = infinito).
2. Nenhum → `null`.
3. Se algum conflitante tem `dataLimite === null && dataInicio <= novo.dataInicio` → `{ tipo: 'SEM_DATA_LIMITE', com: esse }` (RN17: "o atual não tem limite; defina um antes de agendar o próximo").
4. Senão → `{ tipo: 'SOBREPOSTO', com: conflitante de menor dataInicio }` (resposta determinística).

`existentes` contém só panfletos **não excluídos**. Os vencidos entram na lista, mas só conflitam se o período realmente cruzar, o que não ocorre quando o novo começa a partir de hoje.

### 12.7 `PanfletosService`

Dependências: `@InjectModel(Panfleto)`, `@InjectModel(Filial)`, `Sequelize`, `MidiaService`, `AuditoriaService`, `ClockService`, `EventEmitter2`, `Logger`.

#### `criar(tenantId, filialId, dto, arquivo: Buffer): Promise<PanfletoView>`

1. `imagem = await midia.processar(tenantId, arquivo, 'panfleto')`. Fica **fora** da transação: é CPU pesada e não pode segurar conexão nem lock.
2. `sequelize.transaction(async (t) => { … })`:
   1. `filial = Filial.findOne({ where: { id: filialId, tenantId }, lock: t.LOCK.UPDATE, transaction: t })`; `null` → `RECURSO_NAO_ENCONTRADO`. O lock na linha da filial serializa criações e edições de panfleto da mesma filial (seção 14, concorrência).
   2. `hoje = hojeNoFuso(filial.fusoHorario, clock.agora())`.
   3. `r = validarCriacao({ dataInicio: dto.dataInicio, dataLimite: dto.dataLimite ?? null }, hoje)` (Fase 2: RN40, RN42, D5); `!r.ok` → `AppError(r.codigo, { campo: r.campo })` (`DATA_INICIO_INVALIDA` ou `DATA_LIMITE_INVALIDA`, 422).
   4. `{ inicio: dataInicio, limite: dataLimite } = r.valor`.
   5. `existentes = Panfleto.findAll({ where: { tenantId, filialId }, attributes: ['id','dataInicio','dataLimite'], raw: true, transaction: t })` (o paranoid já exclui os excluídos).
   6. `conflito = encontrarConflito(novo, existentes)` → `SEM_DATA_LIMITE` lança `PANFLETO_ATUAL_SEM_DATA_LIMITE`; `SOBREPOSTO` lança `PANFLETO_PERIODO_SOBREPOSTO`, os dois com `detalhes.conflitoCom`.
   7. `caminho = await midia.salvar(tenantId, 'panfleto', imagem)`.
   8. `Panfleto.create({ id: uuidv7(), tenantId, filialId, imagemPath: caminho, imagemLargura, imagemAltura, dataInicio, dataLimite }, { transaction: t })`.
   9. `auditoria.registrarCriacao(tenantId, 'PANFLETO', criado.id, { dataInicio, dataLimite, imagemPath: caminho }, CAMPOS_AUDITADOS.PANFLETO, { transaction: t })` (D3.9).
   10. `t.afterCommit(() => eventos.emit(EVENTO_CONTEUDO_ALTERADO, { tenantId, filialId }))` (D3.10).
3. Se a transação falhar **depois** do passo 7: `logger.warn({ evento: 'midia.arquivo_orfao', caminho, tenantId, erro })` e relança o erro original (D3.4). Implementação: guardar `caminhoSalvo` numa variável externa e tratar no `catch`.
4. Retorna `PanfletoView.de(criado, hoje, storage)`.

A criação grava auditoria com valor anterior nulo (D3.9, alinhada à D6 da Fase 2).

#### `listar(tenantId, filialId, query): Promise<Pagina<PanfletoView>>`

1. Garante que a filial existe e é do tenant (`findOne` com `attributes: ['id','fusoHorario']`); senão 404.
2. `hoje` calculado uma vez.
3. Converte o filtro `situacao` em `where` SQL, sem filtrar em memória:
   - `AGENDADO`: `data_inicio > hoje`
   - `VIGENTE`: `data_inicio <= hoje AND (data_limite IS NULL OR data_limite >= hoje)`
   - `VENCIDO`: `data_limite < hoje`
   - `EXCLUIDO`: `deleted_at IS NOT NULL` com `paranoid: false`
   - Várias situações: `Op.or` das condições; se `EXCLUIDO` estiver na lista, `paranoid: false` e as outras condições ganham `deleted_at IS NULL`.
4. `findAndCountAll` com `order: [['dataInicio','DESC'], ['id','DESC']]`, `limit`, `offset` e `attributes` explícitos.

O builder de `where` fica em `modules/vigencia/consultas/filtro-situacao.ts` (`filtroSituacao(situacoes, hoje)` e as condições `condicaoAgendado/condicaoVigente/condicaoVencido(hoje)`), puro e testável, e é **reaproveitado pelos produtos e categorias na Fase 4**.

#### `detalhar(tenantId, filialId, id)`

`findOne({ where: { id, tenantId, filialId }, paranoid: false })`; `null` → 404. A filial é carregada para o fuso (`include` com `attributes: ['fusoHorario']`, `paranoid: false`, para que seja possível consultar o histórico de uma filial que existe; se a filial estiver excluída → 404).

#### `editarDatas(tenantId, filialId, id, dto)`

Em transação:

1. Lock da filial (igual ao criar) → 404 se inexistente.
2. `panfleto = findOne({ where: { id, tenantId, filialId }, transaction: t, lock: t.LOCK.UPDATE })` → 404 (excluído também gera 404 aqui, porque o paranoid está ativo; não precisa de `ITEM_NAO_EDITAVEL`).
3. `hoje`; `situacaoAtual = calcularSituacao(panfleto, hoje)`.
4. `proximo = { dataInicio: dto.dataInicio ?? atual.dataInicio, dataLimite: 'dataLimite' in dto ? dto.dataLimite : atual.dataLimite }`.
5. `r = validarEdicaoDeDatas(panfleto, { dataInicio: dto.dataInicio, dataLimite: dto.dataLimite }, hoje)` (Fase 2; `undefined` = não alterar, `dataLimite: null` = remover): `VENCIDO` → `ITEM_NAO_EDITAVEL`; `VIGENTE` com `dataInicio` alterada → `DATA_INICIO_IMUTAVEL`; RN42 → `DATA_LIMITE_INVALIDA`; `AGENDADO` com novo início < hoje → `DATA_INICIO_INVALIDA`. `proximo = { dataInicio: r.valor.inicio, dataLimite: r.valor.limite }`.
6. Se nada mudou: retorna a view sem gravar nada (idempotente, sem auditoria vazia).
7. `encontrarConflito(proximo, existentes, ignorarId = id)` → 409.
8. `antes = { dataInicio, dataLimite }`; `panfleto.update(proximo, { transaction: t })`.
9. `auditoria.registrarAlteracoes(tenantId, 'PANFLETO', id, antes, proximo, CAMPOS_AUDITADOS.PANFLETO, { transaction: t })`. Só os campos enviados que mudaram geram linha.
10. `t.afterCommit(() => eventos.emit(EVENTO_CONTEUDO_ALTERADO, { tenantId, filialId }))` (D3.10).

#### `trocarImagem(tenantId, filialId, id, arquivo)`

1. `imagem = await midia.processar(tenantId, arquivo, 'panfleto')` (fora da transação).
2. Transação: lock do panfleto; 404; `situacao ∉ {AGENDADO, VIGENTE}` → `ITEM_NAO_EDITAVEL`; `caminho = await midia.salvar(...)`; `update({ imagemPath, imagemLargura, imagemAltura })`; `registrarAlteracoes(tenantId, 'PANFLETO', id, { imagemPath: antigo }, { imagemPath: caminho }, CAMPOS_AUDITADOS.PANFLETO, { transaction: t })` (D3.2); `afterCommit` → `EVENTO_CONTEUDO_ALTERADO` com `{ tenantId, filialId }`. O arquivo anterior **permanece** no storage.
3. Mesma estratégia de órfão do `criar`.

#### `excluir(tenantId, filialId, id)`

Em transação: `destroy({ where: { id, tenantId, filialId }, transaction: t })` (lógico). Se afetou 0 linhas → 404. Qualquer situação (inclusive vencido) pode ser excluída. `afterCommit` → `EVENTO_CONTEUDO_ALTERADO` com `{ tenantId, filialId }`. Não gera auditoria (RNF07 é preço e datas), mas o `deleted_at` registra quando.

#### `PanfletosExclusaoCascata implements ExclusaoEmCascataFilial`

```ts
readonly nome = 'panfletos';
readonly ordem = 30;
excluirPorFilial(tenantId, filialId, { transaction }) {
  return this.panfletoModel.destroy({ where: { tenantId, filialId }, transaction });
}
```

Registrado em `PanfletosModule.onModuleInit()` com `registry.registrar(this.cascata)`, no padrão definido na Fase 2 (10.2). Não emite evento: a exclusão da filial já emite o seu.

### 12.8 `IdentidadeService` (em `modules/lojistas`)

- `obter(tenantId)`: `Lojista.findOne({ where: { id: tenantId }, attributes: ['id','nomeFantasia','corPrimaria','corSecundaria','logoPath'] })`.
- `editar(tenantId, dto)`: normaliza as cores para maiúsculas; `update` só dos campos presentes; depois do `update` bem-sucedido emite `EVENTO_CONTEUDO_ALTERADO` com `{ tenantId }` (D3.10); retorna a view. Sem auditoria: identidade não é preço nem data.
- `trocarLogo(tenantId, arquivo)`: `processar(tenantId, arquivo, 'logo')` → `salvar(tenantId, 'logo', …)` → `update({ logoPath })` → emite `EVENTO_CONTEUDO_ALTERADO` com `{ tenantId }` (D3.10). Logo anterior mantido. Falha no update após salvar gera log de órfão e não emite evento.

`Lojista` não é `@TenantScoped` (é o próprio tenant), mas toda consulta usa `where: { id: tenantId }` vindo do JWT.

## 13. Testes unitários (BDD)

Relógio fixo em todos: `2026-10-18T15:00:00Z` (12:00 em America/Sao_Paulo, **hoje = 2026-10-18**). Abreviação nos cenários: `E[ini–lim]` = panfleto existente; `—` = sem data limite.

### 13.1 `ImageProcessor` (`image-processor.spec.ts`)

Fixtures geradas no próprio teste com sharp (`sharp({ create: { width, height, channels, background } }).jpeg().toBuffer()`), sem binários commitados, exceto `exif-orientacao-6.jpg` (pequeno, 2 KB) e `truncado.jpg`.

```gherkin
Funcionalidade: Processar imagem enviada (RNF02, RNF05)

  Cenário: JPEG grande do panfleto é reduzido e convertido para WebP
    Dado um JPEG de 4000x3000 px
    Quando processo com o perfil "panfleto"
    Então o resultado é WebP (magic bytes "RIFF....WEBP")
    E a largura é 2400 e a altura é 1800
    E contentType é "image/webp"

  Cenário: imagem menor que o limite não é ampliada
    Dado um PNG de 600x400 px
    Quando processo com o perfil "produto"
    Então a largura é 600 e a altura é 400

  Cenário: imagem em retrato respeita o lado maior
    Dado um JPEG de 3000x6000 px
    Quando processo com o perfil "panfleto"
    Então a altura é 2400 e a largura é 1200

  Esquema do Cenário: perfis de saída
    Dado um JPEG de 5000x5000 px
    Quando processo com o perfil "<perfil>"
    Então o lado maior é <max>
    Exemplos:
      | perfil   | max  |
      | panfleto | 2400 |
      | produto  | 800  |
      | logo     | 512  |

  Cenário: orientação EXIF é aplicada
    Dado um JPEG 200x100 com EXIF Orientation=6
    Quando processo com o perfil "produto"
    Então a largura é 100 e a altura é 200

  Cenário: metadados são removidos
    Dado um JPEG com EXIF contendo GPS
    Quando processo com o perfil "produto"
    Então sharp(resultado).metadata() não tem exif nem icc

  Cenário: PNG com transparência mantém alpha no logo
    Dado um PNG 300x300 com canal alpha
    Quando processo com o perfil "logo"
    Então metadata().hasAlpha é true

  Esquema do Cenário: tipos aceitos pelos magic bytes
    Dado um arquivo <tipo> válido
    Quando processo com o perfil "panfleto"
    Então o processamento <resultado>
    Exemplos:
      | tipo | resultado               |
      | JPEG | conclui                 |
      | PNG  | conclui                 |
      | WebP | conclui                 |
      | GIF  | falha com IMAGEM_INVALIDA |
      | HEIC | falha com IMAGEM_INVALIDA |
      | SVG  | falha com IMAGEM_INVALIDA |
      | PDF  | falha com IMAGEM_INVALIDA |

  Cenário: arquivo de texto renomeado para .jpg
    Dado um buffer "olá mundo" declarado como image/jpeg
    Quando processo
    Então falha com IMAGEM_INVALIDA
    E detalhes.tiposAceitos lista jpeg, png e webp

  Cenário: buffer vazio
    Quando processo um buffer de 0 bytes
    Então falha com IMAGEM_INVALIDA

  Cenário: arquivo maior que MAX_IMAGEM_BYTES
    Dado MAX_IMAGEM_BYTES = 1000 e um buffer de 1001 bytes
    Quando processo
    Então falha com IMAGEM_MUITO_GRANDE
    E o sharp não é chamado

  Cenário: decompression bomb
    Dado IMAGEM_MAX_PIXELS = 1000000 e um PNG de 2000x2000 px (pequeno em bytes)
    Quando processo
    Então falha com IMAGEM_MUITO_GRANDE com detalhes.motivo "dimensoes"

  Cenário: JPEG truncado
    Dado um JPEG cortado pela metade
    Quando processo
    Então falha com IMAGEM_INVALIDA

  Cenário: GIF animado (multi-página) é recusado pelo tipo
    Dado um GIF animado
    Quando processo
    Então falha com IMAGEM_INVALIDA

  Cenário: concorrência limitada
    Dado IMAGEM_CONCORRENCIA = 2 e o sharp simulado levando 50 ms
    Quando disparo 5 processamentos ao mesmo tempo
    Então no máximo 2 executam simultaneamente
    E os 5 terminam com sucesso
```

### 13.2 `SupabaseStorageAdapter` (`supabase-storage.adapter.spec.ts`)

Client do Supabase mockado (`storage.from().upload` como `jest.fn()`).

```gherkin
Funcionalidade: Armazenar no Supabase Storage

  Cenário: upload com cache longo e sem sobrescrita
    Quando salvo "t1/panfleto/abc.webp" com contentType "image/webp"
    Então upload é chamado no bucket "midia" com upsert false e cacheControl "31536000"

  Cenário: falha transitória seguida de sucesso
    Dado que o primeiro upload retorna erro de status 503 e o segundo sucesso
    Quando salvo
    Então não há erro
    E upload foi chamado 2 vezes

  Cenário: falha persistente
    Dado que o upload sempre retorna erro de rede
    Quando salvo
    Então falha com ArmazenamentoIndisponivelError
    E upload foi chamado 2 vezes

  Cenário: erro de configuração não é repetido
    Dado que o upload retorna erro 400 "Bucket not found"
    Quando salvo
    Então falha com erro interno
    E upload foi chamado 1 vez

  Cenário: caminho já existente
    Dado que o upload retorna erro 409 Duplicate
    Quando salvo
    Então falha com erro interno sem nova tentativa

  Cenário: URL pública sem chamada de rede
    Dado SUPABASE_URL "https://xyz.supabase.co"
    Quando peço urlPublica("t1/logo/a b.webp")
    Então recebo "https://xyz.supabase.co/storage/v1/object/public/midia/t1/logo/a%20b.webp"
    E nenhum método do client foi chamado

  Cenário: chave de serviço nunca é logada
    Quando o upload falha
    Então o log não contém o valor de SUPABASE_SERVICE_ROLE_KEY
```

### 13.3 `DiskStorageAdapter` (`disk-storage.adapter.spec.ts`)

Usa diretório temporário (`fs.mkdtemp`).

```gherkin
Funcionalidade: Armazenar em disco (dev/test)

  Cenário: grava criando diretórios
    Quando salvo "t1/panfleto/x.webp"
    Então o arquivo existe em <raiz>/t1/panfleto/x.webp com o conteúdo enviado

  Cenário: não sobrescreve
    Dado que "t1/panfleto/x.webp" já existe
    Quando salvo no mesmo caminho
    Então falha com erro interno
    E o conteúdo original permanece

  Cenário: path traversal
    Quando salvo "../../etc/passwd"
    Então falha com erro interno
    E nada é gravado fora da raiz

  Cenário: URL pública
    Dado MIDIA_URL_BASE_LOCAL "http://localhost:3000/v1/midia-local"
    Quando peço urlPublica("t1/logo/a.webp")
    Então recebo "http://localhost:3000/v1/midia-local/t1/logo/a.webp"
```

### 13.4 `MidiaService` e `montarCaminho`

```gherkin
Funcionalidade: Caminho imutável de mídia

  Cenário: formato do caminho
    Quando monto o caminho para tenant "t1" e perfil "panfleto"
    Então ele casa com /^t1\/panfleto\/[0-9a-f-]{36}\.webp$/

  Cenário: caminhos nunca se repetem
    Quando monto 1000 caminhos
    Então todos são distintos

  Cenário: salvar delega ao StoragePort e devolve o caminho
    Dado uma imagem processada
    Quando salvo para "t1" com perfil "logo"
    Então StoragePort.salvar é chamado com o conteúdo, o caminho e "image/webp"
    E o caminho retornado é o mesmo usado

  Cenário: URL nula para caminho nulo
    Quando peço urlPublica(null)
    Então recebo null

  Cenário: imagem acima do limite do lojista (RNF12, gancho da Fase 2)
    Dado VerificadorLimites.maxImagemBytes("t1") = 2000000 e um buffer de 2500000 bytes
    Quando processo para "t1" com perfil "panfleto"
    Então falha com IMAGEM_MUITO_GRANDE e detalhes.maxBytes 2000000
    E ImageProcessor.processar não é chamado

  Cenário: imagem dentro do limite do lojista
    Dado maxImagemBytes("t1") = 2000000 e um buffer de 1500000 bytes
    Quando processo para "t1"
    Então ImageProcessor.processar é chamado com o buffer e o perfil
```

### 13.5 `encontrarConflito` (puro, `conflito-periodo.spec.ts`)

Existente padrão `E[2026-11-10–2026-11-20]`.

```gherkin
Funcionalidade: Detectar conflito entre períodos de panfleto (RN16, RN17)

  Esquema do Cenário: novo panfleto contra E[10/11–20/11]
    Dado o existente E de 2026-11-10 a 2026-11-20
    Quando verifico o novo de <inicio> a <limite>
    Então o resultado é <resultado>
    Exemplos:
      | caso                         | inicio     | limite     | resultado  |
      | inteiramente antes           | 2026-11-01 | 2026-11-09 | sem conflito |
      | inteiramente depois          | 2026-11-21 | 2026-11-30 | sem conflito |
      | termina no dia em que E começa | 2026-11-05 | 2026-11-10 | SOBREPOSTO |
      | começa no dia em que E termina | 2026-11-20 | 2026-11-25 | SOBREPOSTO |
      | dentro de E                  | 2026-11-12 | 2026-11-15 | SOBREPOSTO |
      | englobando E                 | 2026-11-05 | 2026-11-25 | SOBREPOSTO |
      | idêntico a E                 | 2026-11-10 | 2026-11-20 | SOBREPOSTO |
      | um dia só, dentro            | 2026-11-15 | 2026-11-15 | SOBREPOSTO |
      | sem limite, começando antes  | 2026-11-01 | —          | SOBREPOSTO |
      | sem limite, começando depois | 2026-11-21 | —          | sem conflito |
      | sem limite, começando em E   | 2026-11-20 | —          | SOBREPOSTO |

  Esquema do Cenário: existente sem data limite (RN17)
    Dado o existente S de <ini_s> sem data limite
    Quando verifico o novo de <inicio> a <limite>
    Então o resultado é <resultado>
    Exemplos:
      | caso                               | ini_s      | inicio     | limite     | resultado       |
      | atual vigente sem limite, novo depois | 2026-10-01 | 2026-11-01 | 2026-11-05 | SEM_DATA_LIMITE |
      | ambos sem limite                   | 2026-10-01 | 2026-11-01 | —          | SEM_DATA_LIMITE |
      | mesmo dia de início                | 2026-11-01 | 2026-11-01 | 2026-11-03 | SEM_DATA_LIMITE |
      | S agendado sem limite, novo antes e encostando | 2026-12-01 | 2026-11-01 | 2026-12-01 | SOBREPOSTO |
      | S agendado sem limite, novo antes sem tocar   | 2026-12-01 | 2026-11-01 | 2026-11-30 | sem conflito |
      | S agendado, novo antes sem limite  | 2026-12-01 | 2026-11-01 | —          | SOBREPOSTO |

  Cenário: vencido não conflita com novo período futuro
    Dado o existente V de 2026-10-01 a 2026-10-10
    Quando verifico o novo de 2026-10-18 a 2026-10-31
    Então não há conflito

  Cenário: edição ignora o próprio panfleto
    Dado o existente E (id "p1") de 2026-11-10 a 2026-11-20
    Quando verifico o período 2026-11-10 a 2026-11-25 ignorando "p1"
    Então não há conflito

  Cenário: edição ainda conflita com outro
    Dado E1 ("p1") de 2026-11-10 a 2026-11-20 e E2 ("p2") de 2026-11-21 a 2026-11-30
    Quando verifico p1 estendido até 2026-11-21 ignorando "p1"
    Então o resultado é SOBREPOSTO com E2

  Cenário: SEM_DATA_LIMITE tem prioridade sobre SOBREPOSTO
    Dado S de 2026-10-01 sem limite e E de 2026-11-10 a 2026-11-20 (situação inválida possível só via dados legados)
    Quando verifico o novo de 2026-11-12 a 2026-11-15
    Então o resultado é SEM_DATA_LIMITE com S

  Cenário: escolha determinística entre vários conflitos
    Dado E1 de 2026-11-10 a 2026-11-12 e E2 de 2026-11-14 a 2026-11-16
    Quando verifico o novo de 2026-11-01 a 2026-11-30
    Então o conflito apontado é E1

  Cenário: nenhum existente
    Quando verifico qualquer período contra uma lista vazia
    Então não há conflito
```

### 13.6 `filtroSituacao` (puro, `filtro-situacao.spec.ts`)

```gherkin
Funcionalidade: Traduzir situação em filtro SQL

  Esquema do Cenário: situação única com hoje = 2026-10-18
    Quando gero o filtro para <situacao>
    Então o where equivale a <condicao> e paranoid é <paranoid>
    Exemplos:
      | situacao | condicao                                                   | paranoid |
      | AGENDADO | data_inicio > '2026-10-18'                                 | true     |
      | VIGENTE  | data_inicio <= '2026-10-18' AND (data_limite IS NULL OR data_limite >= '2026-10-18') | true |
      | VENCIDO  | data_limite < '2026-10-18'                                 | true     |
      | EXCLUIDO | deleted_at IS NOT NULL                                     | false    |

  Cenário: padrão sem filtro
    Quando gero o filtro sem situação
    Então não há condição extra e paranoid é true

  Cenário: combinação com excluídos
    Quando gero o filtro para VIGENTE,EXCLUIDO
    Então paranoid é false
    E o where é (VIGENTE AND deleted_at IS NULL) OR deleted_at IS NOT NULL
```

### 13.7 `PanfletosService` (`panfletos.service.spec.ts`)

Mocks: `Panfleto` e `Filial` (`findOne`, `findAll`, `findAndCountAll`, `create`, `destroy`), `sequelize.transaction` executando o callback com um `t` falso, `MidiaService` (`processar` → imagem 1697x2400; `salvar` → `"t1/panfleto/novo.webp"`), `AuditoriaService`, `ClockService` fixo e funções reais do módulo `vigencia` (puras, sem mock). Filial `f1` do tenant `t1`, fuso `America/Sao_Paulo`.

```gherkin
Funcionalidade: Criar panfleto

  Cenário: sem datas vale a partir de hoje e sem limite (RN15, RN40)
    Dado a filial f1 sem panfletos
    Quando o lojista t1 cria um panfleto sem datas
    Então o panfleto é gravado com dataInicio "2026-10-18" e dataLimite null
    E a resposta tem situacao "VIGENTE" e editavel true
    E largura 1697 e altura 2400

  Cenário: agendado
    Quando cria com dataInicio "2026-11-01" e dataLimite "2026-11-15"
    Então a situacao é "AGENDADO"

  Cenário: hoje usa o fuso da filial
    Dado o relógio em 2026-10-19T02:30:00Z e a filial em America/Sao_Paulo
    Quando cria sem dataInicio
    Então dataInicio é "2026-10-18"

  Cenário: hoje em outro fuso
    Dado o relógio em 2026-10-19T03:30:00Z e a filial em America/Manaus
    Quando cria sem dataInicio
    Então dataInicio é "2026-10-18"

  Cenário: data limite antes do início (RN42)
    Quando cria com dataInicio "2026-11-10" e dataLimite "2026-11-01"
    Então falha com DATA_LIMITE_INVALIDA
    E MidiaService.salvar não é chamado
    E Panfleto.create não é chamado

  Cenário: data limite no passado (RN42)
    Quando cria com dataLimite "2026-10-17"
    Então falha com DATA_LIMITE_INVALIDA

  Cenário: data limite hoje é válida
    Quando cria com dataLimite "2026-10-18"
    Então o panfleto é gravado com situacao VIGENTE

  Cenário: data de início no passado (D3.6, D5 da Fase 2)
    Quando cria com dataInicio "2026-10-17"
    Então falha com DATA_INICIO_INVALIDA no campo dataInicio

  Cenário: período sobreposto (RN16)
    Dado um panfleto E de 2026-11-10 a 2026-11-20 em f1
    Quando cria de 2026-11-15 a 2026-11-25
    Então falha com PANFLETO_PERIODO_SOBREPOSTO
    E detalhes.conflitoCom tem o id e o período de E
    E MidiaService.salvar não é chamado

  Cenário: sobreposto com agendado (RN16)
    Dado um panfleto agendado de 2026-12-01 a 2026-12-10
    Quando cria de 2026-11-25 a 2026-12-01
    Então falha com PANFLETO_PERIODO_SOBREPOSTO

  Cenário: atual sem data limite (RN17)
    Dado o panfleto vigente S desde 2026-10-01 sem data limite
    Quando cria de 2026-11-01 a 2026-11-10
    Então falha com PANFLETO_ATUAL_SEM_DATA_LIMITE

  Cenário: próximo agendado após o atual com limite
    Dado o panfleto vigente de 2026-10-01 a 2026-10-31
    Quando cria de 2026-11-01 sem limite
    Então o panfleto é gravado como AGENDADO

  Cenário: excluído não conflita (RN25)
    Dado que findAll (paranoid) retorna lista vazia porque o único panfleto foi excluído
    Quando cria sem datas
    Então o panfleto é gravado
    E findAll foi chamado sem paranoid false

  Cenário: consulta de existentes é enxuta e travada
    Quando cria um panfleto
    Então Filial.findOne recebe where {id: f1, tenantId: t1} e lock UPDATE
    E Panfleto.findAll recebe where {tenantId: t1, filialId: f1}, attributes [id, dataInicio, dataLimite] e raw true
    E todas as chamadas recebem a mesma transaction

  Cenário: filial de outro tenant
    Dado que f9 pertence a t2
    Quando t1 cria panfleto em f9
    Então falha com RECURSO_NAO_ENCONTRADO
    E MidiaService.processar foi chamado (antes da transação), mas salvar não

  Cenário: imagem inválida
    Dado que MidiaService.processar lança IMAGEM_INVALIDA
    Quando cria
    Então falha com IMAGEM_INVALIDA
    E nenhuma transação é aberta

  Cenário: processamento antes da transação (D3.3)
    Quando cria
    Então processar é chamado antes de sequelize.transaction

  Cenário: storage indisponível
    Dado que MidiaService.salvar lança ArmazenamentoIndisponivelError
    Quando cria
    Então falha com ARMAZENAMENTO_INDISPONIVEL
    E Panfleto.create não é chamado
    E não há log de arquivo órfão

  Cenário: falha no banco após upload gera log de órfão (D3.4)
    Dado que Panfleto.create lança erro de exclusão 23P01
    Quando cria
    Então falha com PANFLETO_PERIODO_SOBREPOSTO
    E é logado warn com evento "midia.arquivo_orfao" e caminho "t1/panfleto/novo.webp"

  Cenário: criação grava auditoria com valor anterior nulo (D3.9)
    Quando cria com dataInicio "2026-11-01" e dataLimite "2026-11-15"
    Então AuditoriaService.registrarCriacao é chamado com ('t1', 'PANFLETO', id, { dataInicio: "2026-11-01", dataLimite: "2026-11-15", imagemPath: "t1/panfleto/novo.webp" }, CAMPOS_AUDITADOS.PANFLETO)
    E recebe a mesma transaction do create

  Cenário: criação emite evento após o commit (D3.10)
    Quando cria com sucesso
    Então "filial.conteudo-alterado" é emitido com { tenantId: "t1", filialId: "f1" }
    E só dentro do callback afterCommit

  Cenário: criação com rollback não emite evento
    Dado que Panfleto.create lança erro
    Quando cria
    Então "filial.conteudo-alterado" não é emitido

Funcionalidade: Listar e detalhar panfletos

  Cenário: lista ordenada e paginada com situação calculada
    Dado 3 panfletos (vencido, vigente, agendado)
    Quando listo sem filtro
    Então findAndCountAll recebe order [[dataInicio, DESC], [id, DESC]], limit 50, offset 0
    E cada item tem a situacao correta para hoje 2026-10-18

  Cenário: hoje calculado uma vez
    Quando listo 50 panfletos
    Então ClockService.agora é chamado 1 vez

  Cenário: filtro por situação delega ao filtroSituacao
    Quando listo com situacao=VIGENTE
    Então o where contém a condição de vigência

  Cenário: filial inexistente
    Quando listo panfletos de uma filial inexistente
    Então falha com RECURSO_NAO_ENCONTRADO

  Cenário: detalhar panfleto excluído (consulta, RN25)
    Dado um panfleto excluído
    Quando detalho
    Então recebo situacao "EXCLUIDO", editavel false e excluidoEm preenchido

  Cenário: detalhar panfleto de outra filial do mesmo tenant
    Quando detalho p1 informando a filial f2
    Então falha com RECURSO_NAO_ENCONTRADO

Funcionalidade: Editar datas do panfleto (RN26, RNF07)

  Cenário: estender data limite de vigente
    Dado o panfleto vigente P de 2026-10-01 a 2026-10-20
    Quando altero dataLimite para 2026-10-25
    Então P é atualizado
    E a auditoria registra dataLimite de "2026-10-20" para "2026-10-25"

  Cenário: encurtar data limite de vigente até hoje
    Dado P vigente de 2026-10-01 a 2026-10-31
    Quando altero dataLimite para 2026-10-18
    Então é aceito

  Cenário: definir data limite no atual para liberar o próximo (RN17)
    Dado P vigente desde 2026-10-01 sem limite
    Quando altero dataLimite para 2026-10-31
    Então é aceito e auditado de null para "2026-10-31"

  Cenário: remover data limite (D3.7)
    Dado P vigente de 2026-10-01 a 2026-10-31 e nenhum outro panfleto
    Quando envio dataLimite null
    Então dataLimite fica null

  Cenário: remover data limite gera sobreposição
    Dado P vigente até 2026-10-31 e Q agendado de 2026-11-01 a 2026-11-10
    Quando envio dataLimite null em P
    Então falha com PANFLETO_PERIODO_SOBREPOSTO com Q

  Cenário: alterar início de vigente (RN26)
    Dado P vigente desde 2026-10-01
    Quando altero dataInicio para 2026-10-05
    Então falha com DATA_INICIO_IMUTAVEL

  Cenário: enviar o mesmo início de vigente é aceito
    Dado P vigente desde 2026-10-01 até 2026-10-20
    Quando envio dataInicio 2026-10-01 e dataLimite 2026-10-22
    Então é aceito e só dataLimite é auditado

  Cenário: adiar agendado
    Dado P agendado de 2026-11-01 a 2026-11-10
    Quando altero para 2026-11-05 a 2026-11-15
    Então é aceito e auditoria registra os dois campos

  Cenário: antecipar agendado para hoje
    Dado P agendado de 2026-11-01 a 2026-11-10
    Quando altero dataInicio para 2026-10-18
    Então é aceito e a situacao passa a VIGENTE

  Cenário: editar vencido (RN26)
    Dado P de 2026-10-01 a 2026-10-10
    Quando altero dataLimite para 2026-10-30
    Então falha com ITEM_NAO_EDITAVEL
    E nada é gravado

  Cenário: editar excluído
    Dado P excluído
    Quando edito
    Então falha com RECURSO_NAO_ENCONTRADO

  Cenário: edição sem mudança é no-op
    Dado P agendado de 2026-11-01 a 2026-11-10
    Quando envio exatamente as mesmas datas
    Então update não é chamado
    E auditoria não é chamada

  Cenário: edição não conflita consigo mesma
    Dado P agendado de 2026-11-01 a 2026-11-10 sozinho na filial
    Quando altero dataLimite para 2026-11-12
    Então é aceito

  Cenário: update e auditoria na mesma transação
    Quando edito com sucesso
    Então update e registrarAlteracoes recebem a mesma transaction
    E registrarAlteracoes recebe entidade "PANFLETO" e CAMPOS_AUDITADOS.PANFLETO

  Cenário: adiar agendado para data passada
    Dado P agendado de 2026-11-01 a 2026-11-10
    Quando altero dataInicio para 2026-10-17
    Então falha com DATA_INICIO_INVALIDA

  Cenário: edição emite evento após o commit (D3.10)
    Quando edito com sucesso
    Então "filial.conteudo-alterado" é emitido com { tenantId: "t1", filialId: "f1" } após o commit

  Cenário: edição sem mudança não emite evento
    Dado P agendado de 2026-11-01 a 2026-11-10
    Quando envio exatamente as mesmas datas
    Então "filial.conteudo-alterado" não é emitido

  Cenário: edição recusada não emite evento
    Dado P vencido
    Quando altero dataLimite
    Então falha com ITEM_NAO_EDITAVEL
    E "filial.conteudo-alterado" não é emitido

Funcionalidade: Trocar imagem do panfleto (D3.2)

  Cenário: troca em vigente
    Dado P vigente com imagemPath "t1/panfleto/antigo.webp"
    Quando troco a imagem
    Então imagemPath passa a "t1/panfleto/novo.webp" com nova largura e altura
    E a auditoria registra imagemPath de "t1/panfleto/antigo.webp" para "t1/panfleto/novo.webp"

  Cenário: troca em agendado
    Dado P agendado
    Quando troco a imagem
    Então é aceito

  Cenário: troca em vencido
    Dado P vencido
    Quando troco a imagem
    Então falha com ITEM_NAO_EDITAVEL
    E MidiaService.salvar não é chamado

  Cenário: arquivo anterior não é removido
    Quando troco a imagem
    Então nenhum método de remoção é chamado no storage

  Cenário: troca de imagem emite evento após o commit
    Quando troco a imagem de P vigente
    Então "filial.conteudo-alterado" é emitido com { tenantId: "t1", filialId: "f1" } após o commit

Funcionalidade: Excluir panfleto (RN25)

  Cenário: exclusão lógica
    Quando excluo P
    Então destroy é chamado com where {id: P, tenantId: t1, filialId: f1}
    E sem force

  Cenário: excluir vencido é permitido
    Dado P vencido
    Quando excluo
    Então é aceito

  Cenário: já excluído ou inexistente
    Dado que destroy retorna 0
    Quando excluo
    Então falha com RECURSO_NAO_ENCONTRADO
    E "filial.conteudo-alterado" não é emitido

  Cenário: exclusão emite evento após o commit
    Quando excluo P
    Então "filial.conteudo-alterado" é emitido com { tenantId: "t1", filialId: "f1" } após o commit

Funcionalidade: Cascata da filial (RN12)

  Cenário: exclusão da filial exclui os panfletos
    Quando PanfletosExclusaoCascata.excluirPorFilial(t1, f1, {transaction: t})
    Então destroy é chamado com where {tenantId: t1, filialId: f1} e a transaction t

  Cenário: handler registrado no registry da Fase 2
    Dado o módulo de testes com FiliaisModule e PanfletosModule inicializados
    Quando chamo ExclusaoEmCascataFilialRegistry.listar()
    Então a lista contém PanfletosExclusaoCascata com nome "panfletos" e ordem 30
```

### 13.8 `PanfletoView`

```gherkin
Funcionalidade: Apresentar panfleto

  Cenário: campos expostos
    Quando apresento um panfleto vigente
    Então o JSON tem id, filialId, urlImagem, largura, altura, dataInicio, dataLimite, situacao, editavel, criadoEm, excluidoEm
    E não tem imagemPath nem tenantId

  Esquema do Cenário: editavel por situação
    Dado um panfleto na situação <situacao>
    Então editavel é <editavel>
    Exemplos:
      | situacao | editavel |
      | AGENDADO | true     |
      | VIGENTE  | true     |
      | VENCIDO  | false    |
      | EXCLUIDO | false    |
```

### 13.9 `IdentidadeService` e `IdentidadeView`

```gherkin
Funcionalidade: Identidade visual do lojista (RN06)

  Cenário: obter identidade sem logo
    Dado o lojista t1 sem logo e sem cores
    Quando obtenho a identidade
    Então recebo nomeFantasia, corPrimaria null, corSecundaria null e urlLogo null

  Cenário: editar cores normaliza para maiúsculas
    Quando edito corPrimaria "#c8102e"
    Então é gravado "#C8102E"

  Cenário: editar só um campo
    Quando edito apenas corSecundaria
    Então update recebe apenas corSecundaria

  Cenário: remover cor
    Quando edito corPrimaria null
    Então corPrimaria fica null

  Cenário: editar nome fantasia
    Quando edito nomeFantasia "  Mercado Novo  "
    Então é gravado "Mercado Novo"

  Cenário: consulta sempre pelo tenant do token
    Quando edito
    Então update usa where {id: t1}

  Cenário: trocar logo
    Quando envio um PNG 1000x1000
    Então processar é chamado com o perfil "logo"
    E salvar é chamado com tenant t1 e perfil "logo"
    E logoPath é atualizado
    E a resposta tem urlLogo da nova imagem

  Cenário: logo inválido
    Dado que processar lança IMAGEM_INVALIDA
    Quando troco o logo
    Então falha com IMAGEM_INVALIDA e logoPath não muda

  Cenário: falha no update após upload do logo
    Dado que update lança erro
    Quando troco o logo
    Então é logado warn "midia.arquivo_orfao"
    E "filial.conteudo-alterado" não é emitido

  Cenário: editar identidade emite evento para todas as filiais (D3.10)
    Quando edito corPrimaria
    Então "filial.conteudo-alterado" é emitido com { tenantId: "t1" } sem filialId
    E depois do update bem-sucedido

  Cenário: trocar logo emite evento para todas as filiais
    Quando troco o logo com sucesso
    Então "filial.conteudo-alterado" é emitido com { tenantId: "t1" }

  Cenário: identidade inválida não emite evento
    Dado que update lança erro de CHECK de cor
    Quando edito
    Então "filial.conteudo-alterado" não é emitido
```

### 13.10 DTOs (`*.dto.spec.ts`, com `plainToInstance` + `validate`)

```gherkin
Funcionalidade: Validar entrada

  Esquema do Cenário: datas do panfleto
    Quando valido CriarPanfletoDto com dataLimite <valor>
    Então a validação <resultado>
    Exemplos:
      | valor        | resultado |
      | "2026-10-31" | passa     |
      | ""           | passa (vira undefined) |
      | "31/10/2026" | falha     |
      | "2026-02-30" | falha     |
      | "2026-13-01" | falha     |
      | "2026-10-31T00:00:00Z" | falha |

  Cenário: campo desconhecido
    Quando valido CriarPanfletoDto com tenantId "t2"
    Então falha (forbidNonWhitelisted)

  Cenário: edição vazia
    Quando valido EditarDatasPanfletoDto {}
    Então falha com "informe dataInicio ou dataLimite"

  Cenário: dataLimite null é permitido na edição
    Quando valido EditarDatasPanfletoDto {dataLimite: null}
    Então passa

  Cenário: dataInicio null é recusado na edição
    Quando valido EditarDatasPanfletoDto {dataInicio: null}
    Então falha

  Esquema do Cenário: cores
    Quando valido EditarIdentidadeDto com corPrimaria <valor>
    Então a validação <resultado>
    Exemplos:
      | valor     | resultado |
      | "#C8102E" | passa     |
      | "#c8102e" | passa     |
      | null      | passa     |
      | "C8102E"  | falha     |
      | "#FFF"    | falha     |
      | "red"     | falha     |
      | "#GGGGGG" | falha     |
```

### 13.11 Interceptor de upload

```gherkin
Funcionalidade: Receber arquivo multipart

  Cenário: arquivo acima do limite
    Dado MAX_IMAGEM_BYTES = 1000
    Quando o multer lança LIMIT_FILE_SIZE
    Então a resposta é 413 IMAGEM_MUITO_GRANDE com detalhes.maxBytes 1000

  Cenário: dois arquivos
    Quando o multer lança LIMIT_FILE_COUNT
    Então a resposta é 400 VALIDACAO_INVALIDA no campo imagem

  Cenário: campo de arquivo com outro nome
    Quando o multer lança LIMIT_UNEXPECTED_FILE
    Então a resposta é 400 VALIDACAO_INVALIDA

  Cenário: arquivo ausente
    Quando a requisição não traz "imagem"
    Então a resposta é 400 VALIDACAO_INVALIDA com mensagem "envie a imagem do panfleto"
```

### 13.12 Controllers (`panfletos.controller.spec.ts`, `identidade.controller.spec.ts`)

Só mapeamento. Service mockado.

```gherkin
Funcionalidade: PanfletosController

  Cenário: criar repassa tenant do token, filial do path, dto e buffer
    Quando POST com filialId f1 e o token de t1
    Então service.criar é chamado com (t1, f1, dto, file.buffer)
    E o status é 201

  Cenário: filialId não UUID
    Quando POST com filialId "abc"
    Então 404 RECURSO_NAO_ENCONTRADO (ParseUUIDPipe customizado para 404, não 400, para não revelar formato)

  Cenário: excluir responde 204 sem corpo
    Quando DELETE
    Então o status é 204

  Cenário: rotas de escrita marcadas para o TenantStatusGuard
    Então POST, PATCH, PUT e DELETE não têm @SomenteLeituraPermitida
    E GET tem

Funcionalidade: IdentidadeController

  Cenário: PATCH usa tenant do token
    Quando PATCH /v1/painel/lojista/identidade com o token de t1
    Então service.editar é chamado com (t1, dto)

  Cenário: PUT logo usa o interceptor de upload
    Então o handler tem o UploadImagemInterceptor aplicado
```

### 13.13 Módulo de mídia

```gherkin
Funcionalidade: Escolha do adapter e arquivos estáticos

  Esquema do Cenário: driver por ambiente
    Dado STORAGE_DRIVER <driver>
    Quando o módulo é compilado
    Então STORAGE_PORT resolve para <adapter>
    Exemplos:
      | driver   | adapter                |
      | disco    | DiskStorageAdapter     |
      | supabase | SupabaseStorageAdapter |

  Cenário: production não aceita disco
    Dado NODE_ENV production e STORAGE_DRIVER disco
    Quando o env é validado
    Então a aplicação não sobe

  Cenário: arquivos locais só em development
    Dado NODE_ENV test
    Quando o app é compilado
    Então GET /v1/midia-local/qualquer.webp responde 404
```

### 13.14 Exemplo de implementação Jest

```ts
describe('Funcionalidade: Criar panfleto (RN16, RN17)', () => {
  let service: PanfletosService;
  const panfletoModel = { findAll: jest.fn(), create: jest.fn(), findOne: jest.fn(), destroy: jest.fn() };
  const filialModel = { findOne: jest.fn() };
  const midia = { processar: jest.fn(), salvar: jest.fn(), urlPublica: jest.fn((c) => `https://cdn/${c}`) };
  const auditoria = { registrarCriacao: jest.fn(), registrarAlteracoes: jest.fn() };
  const eventos = { emit: jest.fn() };
  const clock = { agora: jest.fn(() => new Date('2026-10-18T15:00:00Z')) };
  const t = { LOCK: { UPDATE: 'UPDATE' } };
  const sequelize = { transaction: jest.fn((cb) => cb(t)) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        PanfletosService,
        { provide: getModelToken(Panfleto), useValue: panfletoModel },
        { provide: getModelToken(Filial), useValue: filialModel },
        { provide: Sequelize, useValue: sequelize },
        { provide: MidiaService, useValue: midia },
        { provide: AuditoriaService, useValue: auditoria },
        { provide: EventEmitter2, useValue: eventos },
        { provide: ClockService, useValue: clock },
      ],
    }).compile();
    service = mod.get(PanfletosService);
    filialModel.findOne.mockResolvedValue({ id: 'f1', tenantId: 't1', fusoHorario: 'America/Sao_Paulo' });
    midia.processar.mockResolvedValue({ conteudo: Buffer.from('x'), largura: 1697, altura: 2400, contentType: 'image/webp', bytes: 1 });
    midia.salvar.mockResolvedValue('t1/panfleto/novo.webp');
    panfletoModel.create.mockImplementation(async (v) => ({ ...v, createdAt: new Date(), deletedAt: null }));
  });

  describe('Cenário: atual sem data limite', () => {
    describe('Dado o panfleto vigente S desde 2026-10-01 sem data limite', () => {
      beforeEach(() => {
        panfletoModel.findAll.mockResolvedValue([{ id: 's1', dataInicio: '2026-10-01', dataLimite: null }]);
      });

      describe('Quando cria de 2026-11-01 a 2026-11-10', () => {
        const criar = () =>
          service.criar('t1', 'f1', { dataInicio: '2026-11-01', dataLimite: '2026-11-10' }, Buffer.from('img'));

        it('Então falha com PANFLETO_ATUAL_SEM_DATA_LIMITE', async () => {
          await expect(criar()).rejects.toMatchObject({ codigo: 'PANFLETO_ATUAL_SEM_DATA_LIMITE' });
        });

        it('E nada é enviado ao storage nem gravado', async () => {
          await criar().catch(() => undefined);
          expect(midia.salvar).not.toHaveBeenCalled();
          expect(panfletoModel.create).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('Cenário: sem datas vale a partir de hoje (RN40)', () => {
    describe('Dado a filial f1 sem panfletos', () => {
      beforeEach(() => panfletoModel.findAll.mockResolvedValue([]));

      describe('Quando o lojista cria sem datas', () => {
        it('Então grava dataInicio 2026-10-18 e dataLimite null', async () => {
          await service.criar('t1', 'f1', {}, Buffer.from('img'));
          expect(panfletoModel.create).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: 't1', filialId: 'f1', dataInicio: '2026-10-18', dataLimite: null }),
            { transaction: t },
          );
        });

        it('E a resposta está VIGENTE e editável', async () => {
          const view = await service.criar('t1', 'f1', {}, Buffer.from('img'));
          expect(view).toMatchObject({ situacao: 'VIGENTE', editavel: true, largura: 1697, altura: 2400 });
        });
      });
    });
  });
});
```

## 14. Testes de integração (`test/integration/panfletos.int-spec.ts`, `identidade.int-spec.ts`)

Postgres 16 via Testcontainers com migrations reais, `STORAGE_DRIVER=disco` em diretório temporário e `ClockService` sobrescrito para 2026-10-18. HTTP com `supertest`.

```gherkin
Funcionalidade: Garantias do banco para panfletos

  Cenário: EXCLUDE impede sobreposição mesmo sem o service
    Dado um panfleto em f1 de 2026-11-10 a 2026-11-20 inserido direto no banco
    Quando insiro direto outro de 2026-11-15 a 2026-11-25 em f1
    Então o Postgres lança 23P01 na constraint panfletos_periodo_sem_sobreposicao

  Cenário: EXCLUDE trata NULL como infinito
    Dado um panfleto em f1 desde 2026-10-01 sem limite
    Quando insiro direto outro de 2030-01-01 a 2030-01-02
    Então o Postgres lança 23P01

  Cenário: EXCLUDE ignora excluídos
    Dado um panfleto excluído logicamente em f1 de 2026-11-10 a 2026-11-20
    Quando insiro outro no mesmo período em f1
    Então a inserção é aceita

  Cenário: EXCLUDE é por filial
    Dado um panfleto em f1 de 2026-11-10 a 2026-11-20
    Quando insiro outro no mesmo período em f2
    Então a inserção é aceita

  Cenário: CHECK de datas
    Quando insiro direto data_limite anterior a data_inicio
    Então o Postgres lança 23514 em panfletos_datas_validas

  Cenário: tradução do 23P01 no filtro
    Dado o service com encontrarConflito desativado via spy (simula corrida)
    Quando POST de período sobreposto
    Então a resposta é 409 PANFLETO_PERIODO_SOBREPOSTO

  Cenário: migration reversível
    Quando executo db:migrate:undo da migration de panfletos e depois db:migrate
    Então ambos terminam sem erro

Funcionalidade: Concorrência

  Cenário: dois POST simultâneos com períodos sobrepostos na mesma filial
    Dado a filial f1 sem panfletos
    Quando disparo em paralelo (Promise.all) dois POST de 2026-11-01 a 2026-11-10
    Então exatamente um responde 201 e o outro 409 PANFLETO_PERIODO_SOBREPOSTO
    E existe exatamente 1 panfleto em f1

  Cenário: POST simultâneos em filiais diferentes não se bloqueiam
    Quando disparo em paralelo POST em f1 e em f2 com o mesmo período
    Então os dois respondem 201

Funcionalidade: Fluxo HTTP

  Cenário: criar com imagem real e baixar o arquivo gerado
    Quando POST com um JPEG 4000x3000 gerado no teste
    Então 201 com largura 2400 e altura 1800
    E o arquivo existe no diretório de mídia como WebP

  Cenário: imagem com Content-Type falso
    Quando POST com um PDF enviado como image/jpeg
    Então 422 IMAGEM_INVALIDA

  Cenário: arquivo acima do limite
    Dado MAX_IMAGEM_BYTES = 100000
    Quando POST com 200 KB
    Então 413 IMAGEM_MUITO_GRANDE

  Cenário: lojista desativado não cria nem edita (somente leitura)
    Dado t1 DESATIVADO
    Quando POST, PATCH, PUT imagem e DELETE de panfleto
    Então todos respondem 403 LOJISTA_DESATIVADO
    E GET lista responde 200

  Cenário: excluir filial exclui panfletos (RN12 + cascata)
    Dado f1 com um panfleto vigente
    Quando DELETE da filial f1
    Então o panfleto tem deleted_at preenchido
    E o arquivo continua no storage

  Cenário: edição auditada
    Dado P vigente até 2026-10-20
    Quando PATCH dataLimite 2026-10-25
    Então auditoria_alteracoes tem 1 linha nova (entidade PANFLETO, campo dataLimite, "2026-10-20" → "2026-10-25"), além das linhas da criação (D3.9)

Funcionalidade: Vazamento entre tenants (RNF04)

  Esquema do Cenário: lojista A não acessa panfleto de B
    Dado lojista A e lojista B, cada um com filial e panfleto
    Quando A executa <operacao> no panfleto de B (filial de B no path)
    Então a resposta é 404 RECURSO_NAO_ENCONTRADO
    E o panfleto de B não foi alterado
    Exemplos:
      | operacao               |
      | GET detalhe            |
      | GET lista (filial de B)|
      | POST na filial de B    |
      | PATCH datas            |
      | PUT imagem             |
      | DELETE                 |

  Cenário: filial de A com id de panfleto de B
    Quando A faz GET /filiais/{filialA}/panfletos/{panfletoB}
    Então 404

  Cenário: identidade só do próprio tenant
    Quando A faz PATCH identidade
    Então só o registro de A muda
    E o logo de A fica em caminho com prefixo do tenantId de A
```

## 15. Performance e manutenibilidade

- **CPU fora da transação**: o `sharp` roda antes de abrir a transação, para não segurar conexão do pool nem o lock.
- **Lock granular**: `SELECT … FOR UPDATE` na linha da filial serializa só escritas de panfleto daquela filial; leituras não são bloqueadas.
- **Consulta de conflito enxuta**: `attributes` mínimos, `raw: true`, usando o índice GiST do `EXCLUDE`. Uma filial tem poucos panfletos não excluídos, então o volume é desprezível.
- **Imagem pronta para a borda**: WebP com lado máximo de 2400 px fica tipicamente entre 300 e 600 KB para um folheto. Caminho imutável e `Cache-Control: max-age=31536000` no storage. `largura`/`altura` na resposta evitam layout shift.
- **Semáforo de processamento** para picos de upload (D3.8) e `sharp.cache(false)`.
- **Funções puras** (`encontrarConflito`, `filtroSituacao`, `montarCaminho`, perfis) concentram a regra e são reutilizadas pela Fase 4 (produto) e pela Fase 5 (consulta do vigente).
- **Porta de storage** isola o Supabase. Trocar de provedor é escrever um adapter novo.
- **Sem novos números mágicos**: perfis e limites ficam em `perfis-imagem.ts` e `env.schema.ts`.

## 16. Checklist de pronto

- [x] Variáveis de ambiente novas validadas por zod, com regra `production ⇒ supabase`.
- [x] Migration `criar-panfletos` aplica e reverte; `btree_gist` habilitado local e no Supabase.
- [x] `StoragePort` + 2 adapters + `ImageProcessor` + `MidiaService` com testes da seção 13.1–13.4 e 13.13.
- [x] `encontrarConflito` e `filtroSituacao` (em `vigencia/domain`) com 100% de branches.
- [x] `PanfletosService` com todos os cenários da 13.7; cobertura ≥ 90% (linhas e branches).
- [x] `PanfletoView`, DTOs, interceptor e controllers (13.8–13.12).
- [x] Identidade visual (13.9) e rotas `/v1/painel/lojista/identidade` e `/logo`.
- [x] `PanfletosExclusaoCascata` (ordem 30) registrado no `ExclusaoEmCascataFilialRegistry` e testado em integração com a exclusão de filial.
- [x] Auditoria na criação (D3.9) e evento `filial.conteudo-alterado` após o commit em criar/editarDatas/trocarImagem/excluir e na identidade (D3.10), com cenários de rollback sem evento.
- [x] `MidiaService.processar` consulta `VerificadorLimites.maxImagemBytes`.
- [x] Integração: EXCLUDE, CHECK, concorrência, fluxo HTTP, auditoria e vazamento entre tenants (seção 14) verdes.
- [x] `ARMAZENAMENTO_INDISPONIVEL` incluído no catálogo de erros da visão geral.
- [x] Bucket `midia` documentado (público, 5 MB, `image/webp`) para o deploy da Fase 5.
- [x] Arquivo `.http`/Postman com exemplos de todas as rotas da fase (incluindo multipart).
- [x] Nenhum `new Date()` em regra de negócio; nenhum `findByPk` em model `@TenantScoped`.

## 17. Implementação (18/10/2026)

Fase concluída. São 679 testes unitários e 99 de integração passando, estes incluindo as Fases 1 e 2. A cobertura é de 98,4% de linhas e 95,3% de branches. Também testei a app real em development: upload de um JPEG 3000x4000, que saiu como WebP 1800x2400 com 27 KB, servido com `Cache-Control: public, max-age=31536000, immutable`.

### Bucket do Supabase (para o deploy da Fase 5)

Criar manualmente o bucket `midia` com estas opções:

- público;
- `file_size_limit` de 5 MB;
- `allowed_mime_types` `['image/webp']`.

Variáveis de produção: `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (só no servidor) e, para a migration, `DB_EXTENSIONS_SCHEMA=extensions`.

### Desvios em relação a este plano

| Item | Plano | Implementado | Motivo |
| --- | --- | --- | --- |
| `@nestjs/serve-static` | Última versão | `@5` | A 12 exige NestJS 12; o projeto está no 11 |
| `filtroSituacao` | `vigencia/domain/filtro-situacao.ts` | `vigencia/consultas/filtro-situacao.ts` | Depende do `Op` do Sequelize; a regra de lint proíbe Sequelize em `domain/`. Referências nas Fases 4 e 5 e na visão geral corrigidas |
| Filial no `PanfletosService` | `@InjectModel(Filial)` | `FiliaisService.obter(tenantId, id, { transaction, lock })` | Contrato único da Fase 2 para validar a filial do path |
| "hoje" | `hojeNoFuso` + `ClockService` | `VigenciaService.hojeDaFilial(filial)` | Mesmo cálculo, contrato da Fase 2 |
| `PanfletoView.de(p, hoje, storage)` | View recebe o storage | `panfletoView(p, hoje, urlImagem)` | A regra de lint do MVC proíbe view importar service |
| `IdentidadeView.de(lojista, storage)` | Idem | `identidadeView(lojista, urlLogo)` | Idem |
| Interceptor de upload | `FileInterceptor` com limites fixos | `UploadImagemInterceptor` (injetável) que envolve o `FileInterceptor` com `MAX_IMAGEM_BYTES` do env e traduz os erros do multer | O limite vem da configuração, e o arquivo ausente vira `400` com a mensagem em `detalhes.campos.imagem` |
| `ServeStaticModule` | Condicional no `MidiaModule` | `MidiaLocalModule` com `forRootAsync`, que devolve lista vazia fora de development | O `NODE_ENV` é lido do `ConfigService` já validado |
| `ImageProcessor.converter` | Privado | `protected` | O teste de concorrência (D3.8) simula a duração do sharp |
| Erro interno do storage | `ErroInterno` | `Error` comum (vira `500 ERRO_INTERNO` com log no filtro) | Não existe classe `ErroInterno` no contrato de erros |
| Mensagem de arquivo ausente | "envie a imagem do panfleto" | "Envie a imagem no campo \"imagem\"." | O mesmo interceptor atende panfleto e logo |
| Cenário 13.12 `@SomenteLeituraPermitida` em GET | Marcar GET | Não aplicado | O `TenantStatusGuard` já libera GET para desativado; o decorator só faz sentido em POST de leitura |
| CHECK `panfletos_datas_validas` | Não mapeado | Mapeado para `DATA_LIMITE_INVALIDA` | Mesma regra (RN42) caso o service seja contornado |
| Timeout dos testes unitários | 5 s | 15 s (`test/helpers/jest-unit.setup.ts`) | Na primeira execução após mudanças, o ts-jest recompila em todos os workers e testes com CPU real (argon2, QR Code, sharp) passavam às vezes dos 5 s |
| `mensagemDeErro(err)` | Inline nos services | `common/errors/mensagem-de-erro.ts` | Repetido em dois services |

Contratos entregues para a Fase 4: `MidiaService.processar(tenantId, buffer, 'produto')`, `salvar(tenantId, 'produto', imagem)` e `urlPublica(caminho | null)`; `UploadImagemInterceptor`; `filtroSituacao`/`condicao*` em `vigencia/consultas`; e a factory `test/factories/panfleto.factory.ts` com o helper `test/helpers/imagens.ts`.
