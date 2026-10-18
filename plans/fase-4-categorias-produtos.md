# Fase 4 — Categorias e produtos

Plano da Fase 4 do back-end. Convenções, stack, arquitetura MVC, contrato de erros, estratégia de testes e modelo de dados geral estão em [`00-visao-geral.md`](00-visao-geral.md); este documento só detalha o que é próprio da fase.

## 1. Objetivo

Permitir que o lojista organize as ofertas de cada filial em categorias próprias e cadastre, edite e exclua produtos com preço "de/por", vigência e foto. O cadastro de um produto precisa caber em menos de 1 minuto (RNF09), e toda alteração de preço ou data fica auditada (RNF07).

Ao fim da fase, o painel tem tudo o que a página pública (Fase 5) vai ler: panfleto (Fase 3), categorias e produtos.

## 2. Escopo

### Dentro

| Item | Regras |
| --- | --- |
| Model, migration e CRUD de categorias por filial, com contagem de produtos por situação | RN18, RN19, RN20 |
| Exclusão de categoria: bloqueada por produtos vigentes ou agendados; os vencidos são excluídos junto | RN20, RN25 |
| Model, migration e CRUD de produtos com CHECKs de preço e datas | RN19, RN21, RN22, RN40, RN42 |
| Função pura `validarPrecos` | RN21 |
| Cadastro com foto opcional numa única requisição; troca e remoção da foto | RNF09, RNF05 |
| Lista de produtos com filtro por categoria, situação e nome, paginada e em ordem alfabética pt-BR | RN30 (painel) |
| Edição com regras de situação, auditoria de preço e datas e troca de categoria | RN26, RNF07 |
| Exclusão lógica de produto | RN25 |
| Handlers de cascata da filial para produtos e categorias | RN12 |
| Gancho para o limite de produtos por filial | RNF12 (implementado na Fase 5) |
| Testes unitários BDD, testes de integração e testes de vazamento entre tenants | RNF04 |

### Fora (fica para outra fase ou para depois do MVP)

- Entrega pública de categorias e produtos (RN23, RN29–RN32, RN41): Fase 5.
- Valores do limite de produtos (RNF12): Fase 5. Aqui só existe o gancho.
- Cópia entre filiais e ordenação manual: fora do MVP.
- Importação em lote (planilha): fora do MVP.

## 3. Pré-requisitos (entregues pelas fases anteriores)

| De | O que é usado aqui |
| --- | --- |
| Fase 1 | `JwtAuthGuard`, `TenantStatusGuard` (já bloqueia escrita de lojista desativado com `LOJISTA_DESATIVADO`), `@TenantId()`, hooks `@TenantScoped`, `AppError` e `AppExceptionFilter`, `ClockService`, factories base |
| Fase 2 | `FiliaisService.obter(tenantId, filialId, { transaction?, lock? })`, que devolve a filial não excluída (com `fusoHorario`) ou lança `RECURSO_NAO_ENCONTRADO`; `VigenciaService.hojeDaFilial(filial)`; funções puras `calcularSituacao`, `validarCriacao(informadas, hoje)` (RN40, RN42, D5 → `DATA_INICIO_INVALIDA`) e `validarEdicaoDeDatas(atual, novas, hoje)` (RN26), que devolvem `ResultadoValidacao` (o service converte em `AppError`); `AuditoriaService.registrarCriacao(...)` e `registrarAlteracoes(tenantId, entidade, entidadeId, antes, depois, camposAuditados, { transaction })` com `CAMPOS_AUDITADOS.PRODUTO` e entidade `'PRODUTO'`; `ExclusaoEmCascataFilialRegistry` e interface `ExclusaoEmCascataFilial` (`nome`, `ordem`, `excluirPorFilial`); `VERIFICADOR_LIMITES` (`VerificadorLimites.verificarCriacaoProduto`); `EVENTO_CONTEUDO_ALTERADO` / `ConteudoAlteradoEvento` |
| Fase 3 | `MidiaService.processar(tenantId, buffer, 'produto')` → `ImagemProcessada { conteudo, largura, altura, contentType, bytes }` (valida tipo real, tamanho e `maxImagemBytes`, lança `IMAGEM_INVALIDA`/`IMAGEM_MUITO_GRANDE`); `MidiaService.salvar(tenantId, 'produto', imagem)` → caminho `{tenantId}/produto/{uuidv7}.webp`; `MidiaService.urlPublica(caminho)`; estratégia de arquivo órfão (D3.4: não apaga, só loga `midia.arquivo_orfao`; o `StoragePort` não tem `remover`); tradução dos erros do multer; `filtroSituacao` e `condicaoAgendado/condicaoVigente/condicaoVencido(hoje)` em `vigencia/domain/filtro-situacao.ts` |
| Utils | `common/utils/text.ts` → `normalizarParaBusca(texto)` (minúsculas, sem acento via `NFD` e remoção de `\p{M}`, espaços colapsados). Se ainda não existir, é criada nesta fase |

## 4. Decisões desta fase

| # | Decisão | Motivo |
| --- | --- | --- |
| D4.1 | **Cadastro em uma requisição só**: `POST /produtos` aceita `multipart/form-data`, com a foto opcional no campo `foto`, ou `application/json` sem foto. Para trocar ou remover a foto depois, existem `PUT` e `DELETE` em `/produtos/:id/foto`. | RNF09: o lojista preenche e salva uma vez, sem esperar um segundo upload. Também não sobra produto sem foto quando o segundo passo falha. A rota separada cobre a troca, que é rara. |
| D4.2 | **Coluna `nome_normalizado`** em categorias e produtos (minúsculas, sem acento), preenchida por hook `beforeSave` do model. A ordenação do painel é `ORDER BY nome_normalizado, id`, e a busca é `nome_normalizado LIKE '%termo%'`. | Ordenação alfabética pt-BR estável sem depender de collation ICU do Supabase; busca sem acento ("acucar" acha "Açúcar"). |
| D4.3 | **Sem `pg_trgm`** no MVP. A busca usa `LIKE` em `nome_normalizado` depois do filtro por `filial_id` (índice parcial). | O volume é de, no máximo, centenas de produtos não excluídos por filial. O índice por filial reduz o conjunto a algumas centenas de linhas, e o `LIKE` sobre isso leva menos de 1 ms. Um índice GIN de trigramas custaria escrita e espaço sem ganho visível. Reavaliar se uma filial passar de 5 mil produtos. |
| D4.4 | **Nome de categoria único por filial** (sem diferenciar maiúsculas e acentos) entre as não excluídas: índice `UNIQUE (filial_id, nome_normalizado) WHERE deleted_at IS NULL` e erro novo `CATEGORIA_JA_EXISTE` (409). | Duas categorias "Bebidas" quebrariam o agrupamento da página pública (RN29). **Decisão técnica nova, a confirmar com o produto**; se for rejeitada, basta remover o índice e o teste. |
| D4.5 | **Foto antiga não é apagada** do storage ao trocar ou remover a foto. | Coerente com RN25 (nada é apagado de fato) e preserva evidência da oferta divulgada (RNF07/CDC). Arquivos de upload que falharam seguem a estratégia de órfãos da Fase 3. |
| D4.6 | **Concorrência entre excluir categoria e cadastrar produto nela**: a exclusão trava a categoria com `SELECT … FOR UPDATE`; o cadastro, a edição com troca de categoria e a troca de foto travam com `FOR SHARE`. | Sem a trava, um produto vigente poderia ser cadastrado entre a verificação e a exclusão da categoria, ficando órfão (violaria RN19/RN20). |
| D4.7 | **Preços em centavos inteiros** na API (`precoPromocionalCentavos`, `precoOriginalCentavos`), conforme a visão geral. | Sem arredondamento de `float`. |
| D4.8 | **`PATCH` parcial com `null` explícito** para limpar campos opcionais (`precoOriginalCentavos`, `quantidade`, `descricao`, `observacao`, `dataLimite`). `dataInicio: null` é recusado (`VALIDACAO_INVALIDA`), porque toda linha tem início (RN40). | Distingue "não mexer" (campo ausente) de "apagar" (`null`). |
| D4.9 | **Flags de edição na view** (`editavel`, `dataInicioEditavel`). | O front reflete RN26 sem duplicar a regra. |
| D4.10 | **Gancho de limite**: usa `VerificadorLimites.verificarCriacaoProduto(tenantId, filialId, { transaction })` do token `VERIFICADOR_LIMITES` da Fase 2 (implementação `SemLimitesVerificador` até a Fase 5). Nenhuma interface nova. | RNF12 com valores ainda em aberto; contrato único entre fases. |
| D4.11 | **Auditoria na criação**: o cadastro grava `registrarCriacao(tenantId, 'PRODUTO', id, { precoPromocionalCentavos, precoOriginalCentavos, dataInicio, dataLimite }, CAMPOS_AUDITADOS.PRODUTO, { transaction })` | Segue a D6 da Fase 2: prova da oferta desde o primeiro minuto (RNF07/CDC) |
| D4.12 | **Evento após o commit**: `CategoriasService` (renomear, excluir), `ProdutosService` (criar, editar, excluir) e `ProdutoFotoService` (substituir, remover) emitem `filial.conteudo-alterado` com `{ tenantId, filialId }` em `afterCommit`. `CategoriasService.criar` não emite (categoria vazia não aparece, RN41) | Contrato único da Fase 2 (10.3.1), consumido pelo cache da Fase 5 |

Novo código de erro adicionado ao catálogo da visão geral: `CATEGORIA_JA_EXISTE` (409).

## 5. Passo a passo de implementação

Ordem pensada para cada passo terminar com testes verdes.

1. **Utils**: garantir `normalizarParaBusca` em `src/common/utils/text.ts`, com testes (seção 12.1).
2. **Domínio de preço**: `src/modules/produtos/domain/validar-precos.ts`, com testes (seção 12.2).
3. **Migration de categorias**: `src/database/migrations/YYYYMMDDHHMMSS-criar-categorias.js` (seção 6.1).
4. **Migration de produtos**: `src/database/migrations/YYYYMMDDHHMMSS-criar-produtos.js` (seção 6.2).
5. **Models**: `categorias/models/categoria.model.ts` e `produtos/models/produto.model.ts`, com associações e hooks `beforeSave` (seção 7).
6. **Erros**: adicionar `CATEGORIA_JA_EXISTE` ao catálogo em `src/common/errors/codigos.ts` e mapear no filtro as constraints novas (seção 6.3).
7. **Categorias**:
   1. DTOs `criar-categoria.dto.ts`, `renomear-categoria.dto.ts`
   2. View `categoria.view.ts`
   3. `CategoriasService` (seção 10.1) com testes
   4. `CategoriasController` (seção 9.1) com testes
   5. `ExclusaoCascataCategorias` (`nome = 'categorias'`, `ordem = 20`) registrado no `ExclusaoEmCascataFilialRegistry` em `CategoriasModule.onModuleInit()`
   6. `categorias.module.ts`, que exporta `CategoriasService`
8. **Produtos**:
   1. DTOs `criar-produto.dto.ts`, `editar-produto.dto.ts`, `listar-produtos.query.ts`
   2. View `produto.view.ts`
   3. Injetar `VERIFICADOR_LIMITES` (Fase 2) no `ProdutosService`; nenhum arquivo de limite novo nesta fase
   4. `ProdutosService` (seção 10.2) com testes
   5. `ProdutoFotoService` (seção 10.3) com testes
   6. `ProdutosController` (seção 9.2) com testes
   7. `ExclusaoCascataProdutos` (`nome = 'produtos'`, `ordem = 10`) registrado no `ExclusaoEmCascataFilialRegistry` em `ProdutosModule.onModuleInit()`
   8. `produtos.module.ts`, que importa `CategoriasModule`, `FiliaisModule`, `VigenciaModule`, `AuditoriaModule` e `MidiaModule`
9. **Integração**: testes em `test/integration/categorias-produtos.int-spec.ts` e vazamento em `test/integration/vazamento-categorias-produtos.int-spec.ts` (seção 13).
10. **Factories**: `test/factories/categoria.factory.ts` e `test/factories/produto.factory.ts`.
11. **Coleção Postman/`.http`**: exemplos de todas as rotas da fase.

## 6. Migrations

### 6.1 `criar-categorias`

```sql
CREATE TABLE categorias (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES lojistas(id),
  filial_id         uuid NOT NULL REFERENCES filiais(id),
  nome              varchar(80)  NOT NULL,
  nome_normalizado  varchar(80)  NOT NULL,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now(),
  deleted_at        timestamptz  NULL,
  CONSTRAINT categorias_nome_nao_vazio_ck CHECK (length(btrim(nome)) > 0)
);

-- Listagem do painel e verificação de pertencimento
CREATE INDEX categorias_filial_ativas_idx
  ON categorias (tenant_id, filial_id, nome_normalizado)
  WHERE deleted_at IS NULL;

-- D4.4: nome único por filial entre as não excluídas
CREATE UNIQUE INDEX categorias_filial_nome_uk
  ON categorias (filial_id, nome_normalizado)
  WHERE deleted_at IS NULL;
```

`down`: `DROP TABLE categorias;`

### 6.2 `criar-produtos`

```sql
CREATE TABLE produtos (
  id                           uuid PRIMARY KEY,
  tenant_id                    uuid NOT NULL REFERENCES lojistas(id),
  filial_id                    uuid NOT NULL REFERENCES filiais(id),
  categoria_id                 uuid NOT NULL REFERENCES categorias(id),
  nome                         varchar(120) NOT NULL,
  nome_normalizado             varchar(120) NOT NULL,
  quantidade                   varchar(40)  NULL,
  preco_promocional_centavos   integer      NOT NULL,
  preco_original_centavos      integer      NULL,
  descricao                    varchar(500) NULL,
  observacao                   varchar(200) NULL,
  foto_path                    text         NULL,
  data_inicio                  date         NOT NULL,
  data_limite                  date         NULL,
  created_at                   timestamptz  NOT NULL DEFAULT now(),
  updated_at                   timestamptz  NOT NULL DEFAULT now(),
  deleted_at                   timestamptz  NULL,
  CONSTRAINT produtos_nome_nao_vazio_ck       CHECK (length(btrim(nome)) > 0),
  CONSTRAINT produtos_preco_promocional_ck    CHECK (preco_promocional_centavos > 0 AND preco_promocional_centavos <= 99999999),
  CONSTRAINT produtos_preco_original_ck       CHECK (preco_original_centavos IS NULL OR preco_original_centavos > preco_promocional_centavos), -- RN21
  CONSTRAINT produtos_preco_original_max_ck   CHECK (preco_original_centavos IS NULL OR preco_original_centavos <= 99999999),
  CONSTRAINT produtos_datas_ck                CHECK (data_limite IS NULL OR data_limite >= data_inicio)                                 -- RN42 (parte estática)
);

-- Lista do painel e consulta da página pública (Fase 5): filtra por filial e janela de datas
CREATE INDEX produtos_filial_ativos_idx
  ON produtos (tenant_id, filial_id, data_inicio)
  WHERE deleted_at IS NULL;

-- Ordenação alfabética do painel sem sort em memória
CREATE INDEX produtos_filial_nome_idx
  ON produtos (filial_id, nome_normalizado, id)
  WHERE deleted_at IS NULL;

-- Exclusão de categoria (RN20) e contagens por categoria
CREATE INDEX produtos_categoria_ativos_idx
  ON produtos (categoria_id, data_limite)
  WHERE deleted_at IS NULL;
```

Teto de `99999999` centavos (R$ 999.999,99): evita overflow e erro de digitação absurdo.

A parte "data limite ≥ hoje" de RN42 depende do fuso da filial, então só o service a valida. O CHECK cobre o que é estático.

`down`: `DROP TABLE produtos;`

### 6.3 Mapeamento de constraints no `AppExceptionFilter`

| Constraint / SQLSTATE | Código de negócio |
| --- | --- |
| `categorias_filial_nome_uk` (23505) | `CATEGORIA_JA_EXISTE` |
| `produtos_preco_original_ck` (23514) | `PRECO_ORIGINAL_INVALIDO` |
| `produtos_preco_promocional_ck`, `produtos_preco_original_max_ck`, `*_nome_nao_vazio_ck` (23514) | `VALIDACAO_INVALIDA` |
| `produtos_datas_ck` (23514) | `DATA_LIMITE_INVALIDA` |
| FK `produtos.categoria_id` (23503) | `RECURSO_NAO_ENCONTRADO` |

Na prática, o service já barra tudo isso antes. O mapeamento é a rede de segurança para concorrência ou bug.

## 7. Models e associações

### `Categoria` (`modules/categorias/models/categoria.model.ts`)

```ts
@TenantScoped()
@Table({ tableName: 'categorias', underscored: true, paranoid: true })
export class Categoria extends Model {
  @PrimaryKey @Default(() => uuidv7()) @Column(DataType.UUID) id: string;
  @Column(DataType.UUID) tenantId: string;
  @ForeignKey(() => Filial) @Column(DataType.UUID) filialId: string;
  @Column(DataType.STRING(80)) nome: string;
  @Column(DataType.STRING(80)) nomeNormalizado: string;
  @HasMany(() => Produto) produtos?: Produto[];
  @BelongsTo(() => Filial) filial?: Filial;

  @BeforeSave
  static normalizar(c: Categoria) {
    if (c.changed('nome')) c.nomeNormalizado = normalizarParaBusca(c.nome);
  }
}
```

### `Produto` (`modules/produtos/models/produto.model.ts`)

```ts
@TenantScoped()
@Table({ tableName: 'produtos', underscored: true, paranoid: true })
export class Produto extends Model {
  @PrimaryKey @Default(() => uuidv7()) @Column(DataType.UUID) id: string;
  @Column(DataType.UUID) tenantId: string;
  @ForeignKey(() => Filial) @Column(DataType.UUID) filialId: string;
  @ForeignKey(() => Categoria) @Column(DataType.UUID) categoriaId: string;
  @Column(DataType.STRING(120)) nome: string;
  @Column(DataType.STRING(120)) nomeNormalizado: string;
  @Column(DataType.STRING(40)) quantidade: string | null;
  @Column(DataType.INTEGER) precoPromocionalCentavos: number;
  @Column(DataType.INTEGER) precoOriginalCentavos: number | null;
  @Column(DataType.STRING(500)) descricao: string | null;
  @Column(DataType.STRING(200)) observacao: string | null;
  @Column(DataType.TEXT) fotoPath: string | null;
  @Column(DataType.DATEONLY) dataInicio: DataISO;
  @Column(DataType.DATEONLY) dataLimite: DataISO | null;
  @BelongsTo(() => Categoria) categoria?: Categoria;
  @BelongsTo(() => Filial) filial?: Filial;

  @BeforeSave
  static normalizar(p: Produto) {
    if (p.changed('nome')) p.nomeNormalizado = normalizarParaBusca(p.nome);
  }
}
```

Associações: `Filial hasMany Categoria`, `Filial hasMany Produto`, `Categoria hasMany Produto`, `Produto belongsTo Categoria`. Nenhuma tem `onDelete: CASCADE`: a cascata é lógica, feita no service (RN25).

Observação: `DATEONLY` no Sequelize 6 já devolve `string` `YYYY-MM-DD`. Um teste de integração garante isso, para nenhuma conversão para `Date` escapar ao domínio.

## 8. DTOs

Todos usam `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`, já global desde a Fase 1. As mensagens ficam em português. Decorators utilitários (criados em `common/decorators/transform.ts` se ainda não existirem):

- `@TrimString()`: aplica `trim()` em strings, colapsa espaços internos e converte `""` em `undefined` no create (ou `null` no `PATCH`, quando o campo é anulável).
- `@ParseIntForm()`: converte string de multipart em número (`"1299"` → `1299`); valores como `"12.5"` ou `"abc"` continuam inválidos e caem no `@IsInt`.

### 8.1 Categorias

| DTO | Campo | Validação |
| --- | --- | --- |
| `CriarCategoriaDto` | `nome` | obrigatório; `@TrimString`, `@IsString`, `@Length(1, 80)` |
| `RenomearCategoriaDto` | `nome` | igual ao acima |

### 8.2 `CriarProdutoDto` (JSON ou campos de multipart)

| Campo | Obrigatório | Validação |
| --- | --- | --- |
| `nome` | sim | `@TrimString`, `@IsString`, `@Length(1, 120)` |
| `categoriaId` | sim | `@IsUUID('7')` |
| `precoPromocionalCentavos` | sim | `@ParseIntForm`, `@IsInt`, `@Min(1)`, `@Max(99999999)` |
| `precoOriginalCentavos` | não | `@ParseIntForm`, `@IsOptional`, `@IsInt`, `@Min(2)`, `@Max(99999999)`; "maior que o promocional" é validado no service (RN21), que dá mensagem melhor |
| `quantidade` | não | `@TrimString`, `@IsOptional`, `@Length(1, 40)` |
| `descricao` | não | `@TrimString`, `@IsOptional`, `@Length(1, 500)` |
| `observacao` | não | `@TrimString`, `@IsOptional`, `@Length(1, 200)` |
| `dataInicio` | não | `@IsOptional`, `@IsISO8601({ strict: true })` + `@Matches(/^\d{4}-\d{2}-\d{2}$/)` (só data, RN24) |
| `dataLimite` | não | igual a `dataInicio` |
| `foto` (arquivo) | não | via `FileInterceptor('foto')` (seção 9.2), não está no DTO |

### 8.3 `EditarProdutoDto` (`PATCH`, JSON)

Os mesmos campos de 8.2, todos opcionais (`@IsOptional`). Diferenças:

- `precoOriginalCentavos`, `quantidade`, `descricao`, `observacao` e `dataLimite` aceitam `null`, que limpa o campo (`@ValidateIf(v => v !== null)`).
- `dataInicio: null` → `VALIDACAO_INVALIDA` (D4.8).
- `nome`, `categoriaId` e `precoPromocionalCentavos` não aceitam `null`.
- Corpo vazio `{}` → `VALIDACAO_INVALIDA` ("informe ao menos um campo").
- A foto **não** é editada aqui; use `PUT /foto`.

### 8.4 `ListarProdutosQuery`

| Campo | Validação | Padrão |
| --- | --- | --- |
| `categoriaId` | `@IsOptional`, `@IsUUID('7')` | — |
| `situacao` | `@IsOptional`, lista CSV de `AGENDADO,VIGENTE,VENCIDO,EXCLUIDO` (mesmo formato do `ListarPanfletosQueryDto` da Fase 3), convertida por `filtroSituacao` | sem filtro: todos os **não excluídos** |
| `busca` | `@IsOptional`, `@TrimString`, `@Length(1, 60)` | — |
| `pagina` | `@ParseIntForm`, `@IsInt`, `@Min(1)` | 1 |
| `porPagina` | `@ParseIntForm`, `@IsInt`, `@Min(1)`, `@Max(100)` | 50 |

## 9. Controllers e rotas

Todas as rotas ficam sob `/v1/painel/filiais/:filialId`, com `JwtAuthGuard` e `TenantStatusGuard` globais do painel. `:filialId`, `:categoriaId` e `:produtoId` passam por `ParseUUIDPipe({ version: '7' })`; um UUID inválido dá `RECURSO_NAO_ENCONTRADO` (404), não 400, para não diferenciar "malformado" de "inexistente". O `tenantId` vem sempre de `@TenantId()`.

### 9.1 `CategoriasController`

| Método | Rota | Sucesso | Erros |
| --- | --- | --- | --- |
| `GET` | `/categorias` | 200 | 404 (filial) |
| `POST` | `/categorias` | 201 | 400, 404, 409 `CATEGORIA_JA_EXISTE`, 403 `LOJISTA_DESATIVADO` |
| `PATCH` | `/categorias/:categoriaId` | 200 | 400, 404, 409, 403 |
| `DELETE` | `/categorias/:categoriaId` | 204 | 404, 409 `CATEGORIA_COM_PRODUTOS_ATIVOS`, 403 |

Lista de categorias, sem paginação (são poucas por filial), em ordem alfabética:

```http
GET /v1/painel/filiais/0192f0b4-…/categorias
```

```json
{
  "itens": [
    {
      "id": "0192f0c1-…",
      "nome": "Bebidas",
      "produtos": { "vigentes": 12, "agendados": 3, "vencidos": 7 },
      "podeExcluir": false,
      "criadoEm": "2026-10-18T13:02:11.000Z",
      "atualizadoEm": "2026-10-18T13:02:11.000Z"
    },
    {
      "id": "0192f0c2-…",
      "nome": "Hortifrúti",
      "produtos": { "vigentes": 0, "agendados": 0, "vencidos": 4 },
      "podeExcluir": true,
      "criadoEm": "…",
      "atualizadoEm": "…"
    }
  ]
}
```

`podeExcluir = vigentes + agendados === 0`. Assim o front avisa antes (RN20) e informa quantos vencidos serão excluídos junto.

Criar:

```http
POST /v1/painel/filiais/0192f0b4-…/categorias
Content-Type: application/json

{ "nome": "  Mercearia  " }
```

```json
201
{ "id": "0192f0c3-…", "nome": "Mercearia", "produtos": { "vigentes": 0, "agendados": 0, "vencidos": 0 }, "podeExcluir": true, "criadoEm": "…", "atualizadoEm": "…" }
```

Excluir com produto vigente:

```json
409
{ "erro": { "codigo": "CATEGORIA_COM_PRODUTOS_ATIVOS", "mensagem": "Exclua os produtos vigentes e agendados desta categoria antes de excluí-la.", "detalhes": { "vigentes": 2, "agendados": 1 } } }
```

### 9.2 `ProdutosController`

| Método | Rota | Sucesso | Erros |
| --- | --- | --- | --- |
| `GET` | `/produtos` | 200 | 400, 404 (filial) |
| `POST` | `/produtos` | 201 | 400, 404, 413 `IMAGEM_MUITO_GRANDE`, 422 (`PRECO_ORIGINAL_INVALIDO`, `DATA_LIMITE_INVALIDA`, `IMAGEM_INVALIDA`), 409 `LIMITE_DO_PLANO_ATINGIDO`, 403 |
| `GET` | `/produtos/:produtoId` | 200 | 404 |
| `PATCH` | `/produtos/:produtoId` | 200 | 400, 404, 409 (`ITEM_NAO_EDITAVEL`, `DATA_INICIO_IMUTAVEL`), 422, 403 |
| `DELETE` | `/produtos/:produtoId` | 204 | 404, 409 `ITEM_NAO_EDITAVEL` (já excluído), 403 |
| `PUT` | `/produtos/:produtoId/foto` | 200 | 400 (sem arquivo), 404, 409 `ITEM_NAO_EDITAVEL`, 413, 422, 403 |
| `DELETE` | `/produtos/:produtoId/foto` | 200 | 404, 409 `ITEM_NAO_EDITAVEL`, 403 |

`POST /produtos` usa o interceptor de upload da Fase 3 com o campo `foto` (`FileInterceptor('foto', { storage: memoryStorage(), limits: { fileSize: MAX_IMAGEM_BYTES, files: 1, fields: 20 } })` + a mesma tradução de erros do multer). Com `Content-Type: application/json`, o Multer não atua e o corpo é JSON normal. A mesma rota atende os dois casos (D4.1). Um estouro do limite do Multer (`LIMIT_FILE_SIZE`) é traduzido para `IMAGEM_MUITO_GRANDE`.

Cadastro com foto:

```http
POST /v1/painel/filiais/0192f0b4-…/produtos
Content-Type: multipart/form-data; boundary=X

--X  name="nome"                       Arroz Tipo 1
--X  name="categoriaId"                0192f0c3-…
--X  name="quantidade"                 5kg
--X  name="precoPromocionalCentavos"   2199
--X  name="precoOriginalCentavos"      2649
--X  name="observacao"                 Limite 3 por cliente
--X  name="dataLimite"                 2026-10-25
--X  name="foto"; filename="arroz.jpg" (binário)
```

```json
201
{
  "id": "0192f0d0-…",
  "filialId": "0192f0b4-…",
  "categoria": { "id": "0192f0c3-…", "nome": "Mercearia" },
  "nome": "Arroz Tipo 1",
  "quantidade": "5kg",
  "precoPromocionalCentavos": 2199,
  "precoOriginalCentavos": 2649,
  "descricao": null,
  "observacao": "Limite 3 por cliente",
  "urlFoto": "https://<projeto>.supabase.co/storage/v1/object/public/midia/<tenant>/produto/0192f0d1-….webp",
  "dataInicio": "2026-10-18",
  "dataLimite": "2026-10-25",
  "situacao": "VIGENTE",
  "editavel": true,
  "dataInicioEditavel": false,
  "criadoEm": "2026-10-18T15:10:00.000Z",
  "atualizadoEm": "2026-10-18T15:10:00.000Z"
}
```

Cadastro mínimo (só JSON, sem datas). Neste caso `dataInicio` passa a ser hoje no fuso da filial (RN40):

```json
POST … /produtos
{ "nome": "Leite Integral", "categoriaId": "0192f0c4-…", "precoPromocionalCentavos": 499 }
```

Lista:

```http
GET /v1/painel/filiais/0192f0b4-…/produtos?situacao=VIGENTE&busca=acucar&pagina=1&porPagina=50
```

```json
{ "itens": [ { …produto… } ], "total": 2, "pagina": 1, "porPagina": 50 }
```

Edição de um produto vigente:

```json
PATCH … /produtos/0192f0d0-…
{ "precoPromocionalCentavos": 1999, "dataLimite": "2026-10-31" }
→ 200 { …produto atualizado… }
```

Erros de edição:

```json
409 { "erro": { "codigo": "ITEM_NAO_EDITAVEL", "mensagem": "Produtos vencidos ou excluídos não podem ser editados. Cadastre um novo produto." } }
409 { "erro": { "codigo": "DATA_INICIO_IMUTAVEL", "mensagem": "A data de início de um produto já vigente não pode ser alterada." } }
422 { "erro": { "codigo": "PRECO_ORIGINAL_INVALIDO", "mensagem": "O preço original precisa ser maior que o preço promocional.", "detalhes": { "precoPromocionalCentavos": 1999, "precoOriginalCentavos": 1999 } } }
```

## 10. Services

Todos os métodos recebem `tenantId` como primeiro parâmetro e o incluem em todo `where` (visão geral, Isolamento multi-tenant). A filial é sempre resolvida primeiro com `FiliaisService.obter` (Fase 2), que garante a filial do tenant e não excluída. Toda escrita bem-sucedida que muda o que a página pública mostra emite `EVENTO_CONTEUDO_ALTERADO` com `{ tenantId, filialId }` em `t.afterCommit(...)` (D4.12); erro ou rollback não emite. Para excluir, o próprio `TenantStatusGuard` já cobre o lojista desativado.

### 10.1 `CategoriasService`

```ts
listar(tenantId: string, filialId: string): Promise<CategoriaComContagem[]>
criar(tenantId: string, filialId: string, dto: CriarCategoriaDto): Promise<CategoriaComContagem>
renomear(tenantId: string, filialId: string, categoriaId: string, dto: RenomearCategoriaDto): Promise<CategoriaComContagem>
excluir(tenantId: string, filialId: string, categoriaId: string): Promise<void>
// usado por ProdutosService:
obterDaFilial(tenantId: string, filialId: string, categoriaId: string, opts?: { transaction?: Transaction; lock?: LOCK }): Promise<Categoria>
```

**`listar`**, em uma consulta agregada, sem N+1:

```sql
SELECT c.id, c.nome, c.created_at, c.updated_at,
       COUNT(p.id) FILTER (WHERE p.data_inicio <= :hoje AND (p.data_limite IS NULL OR p.data_limite >= :hoje)) AS vigentes,
       COUNT(p.id) FILTER (WHERE p.data_inicio >  :hoje)                                                       AS agendados,
       COUNT(p.id) FILTER (WHERE p.data_limite <  :hoje)                                                       AS vencidos
FROM categorias c
LEFT JOIN produtos p ON p.categoria_id = c.id AND p.deleted_at IS NULL AND p.tenant_id = :tenantId
WHERE c.tenant_id = :tenantId AND c.filial_id = :filialId AND c.deleted_at IS NULL
GROUP BY c.id
ORDER BY c.nome_normalizado, c.id;
```

`hoje = vigenciaService.hojeDaFilial(filial)`. A consulta é escrita com `Categoria.findAll({ attributes: [..., [fn('COUNT', ...), 'vigentes']], include: [{ model: Produto, attributes: [], required: false }], group, raw: true })` ou com `sequelize.query` parametrizada. Se for `query`, o `tenantId` precisa estar no SQL; o hook de tenant não cobre `query`, e um teste de integração verifica isso. As três condições dos `FILTER` são as mesmas de `calcularSituacao`, centralizadas em `vigencia/domain/filtro-situacao.ts` da Fase 3 (`condicaoVigente(hoje)`, `condicaoAgendado(hoje)`, `condicaoVencido(hoje)`) para não divergirem do domínio.

**`criar`**:

1. `filial = filiais.obter(tenantId, filialId)`
2. `Categoria.create({ tenantId, filialId, nome })` (o hook preenche `nomeNormalizado`)
3. Erro 23505 em `categorias_filial_nome_uk` → `CATEGORIA_JA_EXISTE` (traduzido no filtro; o service não faz consulta prévia, para não abrir corrida)
4. Devolve com contagens zeradas, sem consulta extra.

**`renomear`**: em transação, obtém a categoria com `obterDaFilial` (404 se for de outra filial, de outro tenant ou excluída), faz `update({ nome })`, `afterCommit` → `EVENTO_CONTEUDO_ALTERADO` `{ tenantId, filialId }`, e devolve com contagens (reusa a query de `listar` filtrada por `c.id`). Nome igual → no-op que devolve 200 sem evento.

**`excluir`** (RN20), em transação `READ COMMITTED`:

1. `filial = filiais.obter(tenantId, filialId, { transaction })`
2. `categoria = obterDaFilial(..., { transaction, lock: LOCK.UPDATE })` → 404 se não existir
3. `hoje = hojeDaFilial(filial)`
4. Contagem numa query: `COUNT(*) FILTER (vigente)`, `COUNT(*) FILTER (agendado)` dos produtos não excluídos da categoria
5. Se `vigentes + agendados > 0` → `CATEGORIA_COM_PRODUTOS_ATIVOS` com `detalhes: { vigentes, agendados }`
6. `Produto.destroy({ where: { tenantId, categoriaId, filialId }, transaction })`: exclusão lógica dos vencidos. Pelo passo 5, só sobram vencidos
7. `categoria.destroy({ transaction })`
8. `afterCommit` → `EVENTO_CONTEUDO_ALTERADO` `{ tenantId, filialId }`

A trava `FOR UPDATE` do passo 2 conflita com o `FOR SHARE` que `ProdutosService` usa ao cadastrar ou mover produto para a categoria (D4.6). Assim nenhum produto entra na categoria entre os passos 4 e 7.

**`obterDaFilial`**: `Categoria.findOne({ where: { id, tenantId, filialId }, transaction, lock })`, com `paranoid` padrão (ignora as excluídas). `null` → `RECURSO_NAO_ENCONTRADO`.

### 10.2 `ProdutosService`

```ts
listar(tenantId: string, filialId: string, q: ListarProdutosQuery): Promise<Pagina<ProdutoComCategoria>>
obter(tenantId: string, filialId: string, produtoId: string): Promise<ProdutoComCategoria>   // inclui excluídos (consulta)
criar(tenantId: string, filialId: string, dto: CriarProdutoDto, foto?: ArquivoRecebido): Promise<ProdutoComCategoria>
editar(tenantId: string, filialId: string, produtoId: string, dto: EditarProdutoDto): Promise<ProdutoComCategoria>
excluir(tenantId: string, filialId: string, produtoId: string): Promise<void>
```

`ProdutoComCategoria = { produto: Produto; categoria: Pick<Categoria,'id'|'nome'>; hoje: DataISO }`. A view usa `hoje` para calcular `situacao` e as flags, sem consultar o relógio de novo.

**`listar`**:

1. `filial = filiais.obter(tenantId, filialId)`; `hoje = hojeDaFilial(filial)`
2. `where = { tenantId, filialId }` + `categoriaId?`
3. Situação: `{ where: whereSituacao, paranoid } = filtroSituacao(q.situacao, hoje)` (Fase 3, `vigencia/domain/filtro-situacao.ts`), combinado com o `where` do passo 2:
   - `VIGENTE`: `dataInicio <= hoje AND (dataLimite IS NULL OR dataLimite >= hoje)`
   - `AGENDADO`: `dataInicio > hoje`
   - `VENCIDO`: `dataLimite < hoje`
   - `EXCLUIDO`: `paranoid: false` + `deletedAt IS NOT NULL`
   - ausente: todos os não excluídos (`paranoid` padrão)
4. `busca`: `nomeNormalizado LIKE '%' || escaparLike(normalizarParaBusca(busca)) || '%'` (escapa `%`, `_` e `\`)
5. `Produto.findAndCountAll({ where, include: [{ model: Categoria, attributes: ['id','nome'], paranoid: false }], order: [['nomeNormalizado','ASC'], ['id','ASC']], limit: porPagina, offset: (pagina-1)*porPagina, attributes: <colunas da view> })`. O `paranoid: false` no include deixa o produto excluído em cascata mostrar a categoria também excluída.
6. Retorna `{ itens, total, pagina, porPagina }`.

**`obter`**: `Produto.findOne({ where: { id, tenantId, filialId }, paranoid: false, include: categoria })`. `null` → 404. A filial também é validada com `filiais.obter`; se a filial estiver excluída → 404.

**`criar`** (RN19, RN21, RN40, RN42):

1. `filial = filiais.obter(tenantId, filialId)`; `hoje = hojeDaFilial(filial)`
2. `validarPrecos(dto.precoPromocionalCentavos, dto.precoOriginalCentavos ?? null)` → lança `PRECO_ORIGINAL_INVALIDO`
3. `r = validarCriacao({ dataInicio: dto.dataInicio, dataLimite: dto.dataLimite ?? null }, hoje)` (Fase 2: RN40, RN42, D5); `!r.ok` → `AppError(r.codigo, { campo: r.campo })` (`DATA_INICIO_INVALIDA` ou `DATA_LIMITE_INVALIDA`); `{ inicio: dataInicio, limite: dataLimite } = r.valor`
4. (reservado: as validações puras terminam aqui, antes de qualquer I/O)
5. Se houver `foto`: `imagem = await midia.processar(tenantId, foto.buffer, 'produto')` (valida tipo real, tamanho e limite do lojista, lança `IMAGEM_INVALIDA`/`IMAGEM_MUITO_GRANDE`); `fotoPath = await midia.salvar(tenantId, 'produto', imagem)`. Isso é feito **antes** da transação, para não segurar conexão do pool durante I/O de rede.
6. Transação:
   1. `obterDaFilial(tenantId, filialId, dto.categoriaId, { transaction, lock: LOCK.SHARE })` → 404 se a categoria for de outra filial, outro tenant ou estiver excluída
   2. `limites.verificarCriacaoProduto(tenantId, filialId, { transaction })` (`VERIFICADOR_LIMITES`; no-op até a Fase 5)
   3. `Produto.create({ tenantId, filialId, categoriaId, nome, quantidade, precos, descricao, observacao, fotoPath, dataInicio, dataLimite }, { transaction })`
   4. `auditoria.registrarCriacao(tenantId, 'PRODUTO', produto.id, { precoPromocionalCentavos, precoOriginalCentavos, dataInicio, dataLimite }, CAMPOS_AUDITADOS.PRODUTO, { transaction })` (D4.11)
   5. `transaction.afterCommit(() => eventos.emit(EVENTO_CONTEUDO_ALTERADO, { tenantId, filialId }))` (D4.12)
7. Se a transação falhar depois do passo 5, a foto salva vira órfã: **não** é apagada (o `StoragePort` não tem remoção, D3.4 da Fase 3); o `catch` registra `logger.warn({ evento: 'midia.arquivo_orfao', caminho: fotoPath, tenantId, erro })` e relança o erro original.
8. Retorna `{ produto, categoria, hoje }`.

A criação gera auditoria com valor anterior nulo dos campos de `CAMPOS_AUDITADOS.PRODUTO` (D4.11, alinhada à D6 da Fase 2).

**`editar`** (RN19, RN21, RN26, RN42, RNF07):

1. `filial = filiais.obter(tenantId, filialId)`; `hoje = hojeDaFilial(filial)`
2. Transação:
   1. `produto = Produto.findOne({ where: { id, tenantId, filialId }, paranoid: false, transaction, lock: LOCK.UPDATE })` → 404
   2. `situacao = calcularSituacao(produto, hoje)`; se for `VENCIDO` ou `EXCLUIDO` → `ITEM_NAO_EDITAVEL`
   3. Monta o estado resultante: `depois = { ...antes, ...camposPresentesNoDto }` (ausente = mantém; `null` = limpa)
   4. Se `dto.dataInicio !== undefined || dto.dataLimite !== undefined`: `r = validarEdicaoDeDatas(produto, { dataInicio: dto.dataInicio, dataLimite: dto.dataLimite }, hoje)` (Fase 2): `dataInicio` alterada num item `VIGENTE` → `DATA_INICIO_IMUTAVEL`; início de agendado no passado → `DATA_INICIO_INVALIDA`; RN42 sobre o estado resultante → `DATA_LIMITE_INVALIDA`; `depois.dataInicio/dataLimite = r.valor.inicio/limite`
   5. `validarPrecos(depois.precoPromocionalCentavos, depois.precoOriginalCentavos)`. Usa os valores **resultantes**: baixar só o original para abaixo do promocional atual também falha
   6. Se `dto.categoriaId` existir e for diferente: `obterDaFilial(tenantId, filialId, dto.categoriaId, { transaction, lock: LOCK.SHARE })` → 404 se for de outra filial ou excluída
   7. `mudancas = diff(antes, depois)`; se estiver vazio → commit sem `UPDATE` e retorna o atual (idempotente)
   8. `produto.update(mudancas, { transaction })`
   9. `auditoria.registrarAlteracoes(tenantId, 'PRODUTO', produto.id, antes, mudancas, CAMPOS_AUDITADOS.PRODUTO, { transaction })`. A Fase 2 só grava os campos auditados presentes em `mudancas` que realmente mudaram; se nenhum mudou, não grava nada
   10. `afterCommit` → `EVENTO_CONTEUDO_ALTERADO` `{ tenantId, filialId }` (D4.12)
3. Recarrega a categoria (caso tenha mudado) e retorna.

**`excluir`**: em transação, `findOne` com `paranoid: false` e `LOCK.UPDATE` → 404; se `deletedAt` já estiver preenchido → `ITEM_NAO_EDITAVEL`; senão `produto.destroy({ transaction })` e `afterCommit` → `EVENTO_CONTEUDO_ALTERADO` `{ tenantId, filialId }`. Excluir um produto **vencido** é permitido: limpa a lista do lojista, e RN26 proíbe só reativar ou editar. Não gera auditoria de preço ou data; o `deleted_at` é o registro.

### 10.3 `ProdutoFotoService`

```ts
substituir(tenantId, filialId, produtoId, foto: ArquivoRecebido): Promise<ProdutoComCategoria>
remover(tenantId, filialId, produtoId): Promise<ProdutoComCategoria>
```

`substituir`:
1. `filiais.obter(tenantId, filialId)`; `hoje`
2. Leitura prévia (sem trava) do produto: 404; se não for editável → `ITEM_NAO_EDITAVEL`. Falha antes de processar a imagem, para economizar CPU
3. `imagem = midia.processar(tenantId, buffer, 'produto')` → `novoPath = midia.salvar(tenantId, 'produto', imagem)`
4. Transação: `findOne` + `LOCK.UPDATE`; revalida a situação (pode ter vencido ou sido excluído no meio: então loga a nova foto como órfã, `midia.arquivo_orfao`, e lança `ITEM_NAO_EDITAVEL`); `update({ fotoPath: novoPath })`; `afterCommit` → `EVENTO_CONTEUDO_ALTERADO` `{ tenantId, filialId }`
5. A foto antiga continua no storage (D4.5).

`remover`: mesma validação de situação; `update({ fotoPath: null })` em transação e `afterCommit` → `EVENTO_CONTEUDO_ALTERADO`. Sem foto → no-op 200, sem evento. Nenhum dos dois apaga arquivo do storage (D4.5).

### 10.4 Cascata da filial (RN12)

```ts
@Injectable()
export class ExclusaoCascataProdutos implements ExclusaoEmCascataFilial {
  readonly nome = 'produtos';
  readonly ordem = 10;                     // produtos antes das categorias
  excluirPorFilial(tenantId, filialId, { transaction }) {
    return this.produtoModel.destroy({ where: { tenantId, filialId }, transaction });
  }
}
@Injectable()
export class ExclusaoCascataCategorias implements ExclusaoEmCascataFilial {
  readonly nome = 'categorias';
  readonly ordem = 20;
  excluirPorFilial(tenantId, filialId, { transaction }) {
    return this.categoriaModel.destroy({ where: { tenantId, filialId }, transaction });
  }
}
```

Registro nos módulos, conforme o mecanismo da Fase 2 (10.2): `ProdutosModule.onModuleInit() { registry.registrar(this.cascataProdutos) }` e `CategoriasModule.onModuleInit() { registry.registrar(this.cascataCategorias) }`, com `ExclusaoEmCascataFilialRegistry` injetado do `FiliaisModule`. O registry executa por `ordem` crescente (produtos 10, categorias 20, panfletos 30); como a FK não é afetada por soft delete, a ordem não muda o resultado, só deixa os logs determinísticos. Os handlers não emitem evento: a exclusão da filial já emite o seu.

`destroy` em lote com `paranoid` faz um único `UPDATE … SET deleted_at = now() WHERE tenant_id = … AND filial_id = … AND deleted_at IS NULL`. Usa o índice parcial e não dispara hooks por linha (`individualHooks: false`).

### 10.5 Gancho de limite (RNF12)

Sem contrato novo: `ProdutosService` injeta `@Inject(VERIFICADOR_LIMITES) limites: VerificadorLimites` (Fase 2, 10.3) e chama `limites.verificarCriacaoProduto(tenantId, filialId, { transaction })` dentro da transação de criação. Até a Fase 5 o provider é `SemLimitesVerificador` (no-op); a Fase 5 troca para `LimitesService`, que lê `lojista_limites.max_produtos_por_filial` e conta os produtos não excluídos da filial.

### 10.6 Função pura `validarPrecos` (`produtos/domain/validar-precos.ts`)

```ts
export function validarPrecos(promocional: number, original: number | null): void {
  if (!Number.isInteger(promocional) || promocional <= 0) throw new AppError('VALIDACAO_INVALIDA', …);
  if (original === null) return;
  if (!Number.isInteger(original)) throw new AppError('VALIDACAO_INVALIDA', …);
  if (original <= promocional) throw new AppError('PRECO_ORIGINAL_INVALIDO', 'O preço original precisa ser maior que o preço promocional.', { precoPromocionalCentavos: promocional, precoOriginalCentavos: original });
}
```

## 11. Views

### `CategoriaView` (`categorias/views/categoria.view.ts`)

`toJSON(c: CategoriaComContagem)` → `{ id, nome, produtos: { vigentes, agendados, vencidos }, podeExcluir, criadoEm, atualizadoEm }`. As contagens chegam do Postgres como `string` (bigint) e são convertidas para `number` aqui.

### `ProdutoView` (`produtos/views/produto.view.ts`)

```ts
toJSON({ produto: p, categoria, hoje }: ProdutoComCategoria, midia: Pick<MidiaService, 'urlPublica'>) {
  const situacao = calcularSituacao(p, hoje);
  return {
    id: p.id, filialId: p.filialId,
    categoria: { id: categoria.id, nome: categoria.nome },
    nome: p.nome, quantidade: p.quantidade,
    precoPromocionalCentavos: p.precoPromocionalCentavos,
    precoOriginalCentavos: p.precoOriginalCentavos,
    descricao: p.descricao, observacao: p.observacao,
    urlFoto: midia.urlPublica(p.fotoPath),   // null se fotoPath for null
    dataInicio: p.dataInicio, dataLimite: p.dataLimite,
    situacao,                                              // 'AGENDADO' | 'VIGENTE' | 'VENCIDO' | 'EXCLUIDO'
    editavel: situacao === 'AGENDADO' || situacao === 'VIGENTE',
    dataInicioEditavel: situacao === 'AGENDADO',
    criadoEm: p.createdAt.toISOString(), atualizadoEm: p.updatedAt.toISOString(),
    excluidoEm: p.deletedAt?.toISOString() ?? null,
  };
}
```

`nomeNormalizado`, `tenantId` e `fotoPath` nunca são expostos.

## 12. Testes unitários (BDD)

Formato e convenções conforme a visão geral (Gherkin no plano, `describe`/`it` em português no Jest, relógio fixo). Nos cenários abaixo, "hoje" é **2026-10-18** no fuso da filial (`America/Sao_Paulo`). Situações dos produtos de exemplo:

| Rótulo | dataInicio | dataLimite | deletedAt | Situação |
| --- | --- | --- | --- | --- |
| P-vigente | 2026-10-10 | 2026-10-25 | null | VIGENTE |
| P-vigente-sem-limite | 2026-10-01 | null | null | VIGENTE |
| P-vigente-ultimo-dia | 2026-10-10 | 2026-10-18 | null | VIGENTE |
| P-agendado | 2026-10-20 | 2026-10-30 | null | AGENDADO |
| P-vencido | 2026-10-01 | 2026-10-17 | null | VENCIDO |
| P-excluido | 2026-10-10 | 2026-10-25 | 2026-10-15 | EXCLUIDO |

### 12.1 `normalizarParaBusca` (`common/utils/__tests__/text.spec.ts`)

```gherkin
Funcionalidade: Normalização de texto para busca e ordenação

  Esquema do Cenário: normalizar nomes
    Dado o texto "<entrada>"
    Quando normalizo para busca
    Então obtenho "<saida>"
    Exemplos:
      | entrada              | saida              |
      | Açúcar Refinado      | acucar refinado    |
      | ÁGUA   MINERAL       | agua mineral       |
      |   Pão de Queijo      | pao de queijo      |
      | Café 3 Corações      | cafe 3 coracoes    |
      | Hortifrúti           | hortifruti         |

  Cenário: a ordem pelo texto normalizado segue o alfabeto pt-BR
    Dado os nomes "Óleo", "Arroz", "Ábacate", "Banana"
    Quando ordeno pelo valor normalizado
    Então a ordem é "Ábacate", "Arroz", "Banana", "Óleo"
```

### 12.2 `validarPrecos` (`produtos/domain/__tests__/validar-precos.spec.ts`)

```gherkin
Funcionalidade: Validação de preços do produto (RN21)

  Cenário: só preço promocional
    Dado preço promocional 499 e sem preço original
    Quando valido os preços
    Então nenhum erro é lançado

  Cenário: preço original maior que o promocional
    Dado preço promocional 2199 e preço original 2649
    Quando valido os preços
    Então nenhum erro é lançado

  Cenário: preço original um centavo acima do promocional
    Dado preço promocional 1000 e preço original 1001
    Quando valido os preços
    Então nenhum erro é lançado

  Cenário: preço original igual ao promocional
    Dado preço promocional 1000 e preço original 1000
    Quando valido os preços
    Então recebo PRECO_ORIGINAL_INVALIDO
    E os detalhes trazem os dois valores

  Cenário: preço original menor que o promocional
    Dado preço promocional 1000 e preço original 999
    Quando valido os preços
    Então recebo PRECO_ORIGINAL_INVALIDO

  Esquema do Cenário: preço promocional inválido
    Dado preço promocional <promo>
    Quando valido os preços
    Então recebo VALIDACAO_INVALIDA
    Exemplos:
      | promo |
      | 0     |
      | -1    |
      | 10.5  |

  Cenário: preço original não inteiro
    Dado preço promocional 1000 e preço original 1500.5
    Quando valido os preços
    Então recebo VALIDACAO_INVALIDA
```

Exemplo Jest:

```ts
describe('Funcionalidade: Validação de preços do produto (RN21)', () => {
  describe('Cenário: preço original igual ao promocional', () => {
    describe('Dado preço promocional 1000 e preço original 1000', () => {
      describe('Quando valido os preços', () => {
        const executar = () => validarPrecos(1000, 1000);

        it('Então recebo PRECO_ORIGINAL_INVALIDO', () => {
          expect(executar).toThrow(expect.objectContaining({ codigo: 'PRECO_ORIGINAL_INVALIDO' }));
        });

        it('E os detalhes trazem os dois valores', () => {
          try { executar(); } catch (e) {
            expect((e as AppError).detalhes).toEqual({ precoPromocionalCentavos: 1000, precoOriginalCentavos: 1000 });
          }
          expect.assertions(1);
        });
      });
    });
  });

  it.each([0, -1, 10.5])('Cenário: preço promocional inválido (%p) → VALIDACAO_INVALIDA', (promo) => {
    expect(() => validarPrecos(promo, null)).toThrow(expect.objectContaining({ codigo: 'VALIDACAO_INVALIDA' }));
  });
});
```

### 12.3 DTOs (`produtos/dtos/__tests__/*.spec.ts`, com `plainToInstance` + `validate`)

```gherkin
Funcionalidade: Validação de entrada do produto

  Cenário: cadastro mínimo válido
    Dado o corpo { nome: "Leite", categoriaId: <uuid v7>, precoPromocionalCentavos: 499 }
    Quando valido o CriarProdutoDto
    Então não há erros

  Cenário: campos de multipart chegam como texto
    Dado precoPromocionalCentavos "2199" e precoOriginalCentavos "2649" como strings
    Quando valido o CriarProdutoDto
    Então os valores viram os inteiros 2199 e 2649

  Esquema do Cenário: preço em formato inválido
    Dado precoPromocionalCentavos "<valor>"
    Quando valido o CriarProdutoDto
    Então há erro no campo precoPromocionalCentavos
    Exemplos:
      | valor  |
      | 21.99  |
      | abc    |
      | 0      |
      | (vazio)|

  Cenário: nome só com espaços
    Dado nome "   "
    Quando valido o CriarProdutoDto
    Então há erro no campo nome

  Cenário: nome é aparado
    Dado nome "  Arroz  Tipo 1 "
    Quando valido o CriarProdutoDto
    Então o nome fica "Arroz Tipo 1"

  Esquema do Cenário: tamanhos máximos
    Dado o campo <campo> com <n> caracteres
    Quando valido o CriarProdutoDto
    Então <resultado>
    Exemplos:
      | campo      | n   | resultado                 |
      | nome       | 120 | não há erros              |
      | nome       | 121 | há erro no campo nome     |
      | quantidade | 41  | há erro no campo quantidade |
      | descricao  | 501 | há erro no campo descricao |
      | observacao | 201 | há erro no campo observacao |

  Esquema do Cenário: datas só com dia
    Dado dataLimite "<valor>"
    Quando valido o CriarProdutoDto
    Então <resultado>
    Exemplos:
      | valor                     | resultado                    |
      | 2026-10-25                | não há erros                 |
      | 2026-10-25T00:00:00Z      | há erro no campo dataLimite  |
      | 25/10/2026                | há erro no campo dataLimite  |
      | 2026-02-30                | há erro no campo dataLimite  |

  Cenário: categoriaId inválido
    Dado categoriaId "123"
    Quando valido o CriarProdutoDto
    Então há erro no campo categoriaId

  Cenário: campo desconhecido
    Dado o corpo com tenantId extra
    Quando valido o CriarProdutoDto
    Então há erro de propriedade não permitida

  Cenário: edição vazia
    Dado o corpo {}
    Quando valido o EditarProdutoDto
    Então há erro "informe ao menos um campo"

  Cenário: edição limpa campos opcionais com null
    Dado o corpo { precoOriginalCentavos: null, dataLimite: null, observacao: null }
    Quando valido o EditarProdutoDto
    Então não há erros

  Cenário: edição não aceita dataInicio nula
    Dado o corpo { dataInicio: null }
    Quando valido o EditarProdutoDto
    Então há erro no campo dataInicio

  Cenário: edição não aceita nome nulo
    Dado o corpo { nome: null }
    Quando valido o EditarProdutoDto
    Então há erro no campo nome

  Cenário: filtro de lista com situação desconhecida
    Dado situacao "ativo"
    Quando valido o ListarProdutosQuery
    Então há erro no campo situacao

  Cenário: porPagina acima do máximo
    Dado porPagina 101
    Quando valido o ListarProdutosQuery
    Então há erro no campo porPagina
```

### 12.4 `CategoriasService` (`categorias/services/__tests__/categorias.service.spec.ts`)

Mocks: `getModelToken(Categoria)`, `getModelToken(Produto)`, `Sequelize` (`transaction` executa o callback com uma transação falsa), `FiliaisService`, `VigenciaService` (hoje fixo).

```gherkin
Funcionalidade: Listar categorias da filial

  Cenário: lista com contagens por situação
    Dado a filial F1 do tenant T1
    E a categoria "Bebidas" com P-vigente, P-agendado, P-vencido e P-excluido
    Quando listo as categorias de F1
    Então "Bebidas" vem com vigentes 1, agendados 1 e vencidos 1
    E o produto excluído não é contado
    E podeExcluir é falso

  Cenário: categoria só com vencidos pode ser excluída
    Dado a categoria "Hortifrúti" só com P-vencido
    Quando listo as categorias
    Então podeExcluir é verdadeiro

  Cenário: ordem alfabética pt-BR
    Dado as categorias "Óleos", "açougue", "Bebidas"
    Quando listo as categorias
    Então a consulta ordena por nome_normalizado e depois por id

  Cenário: filial de outro tenant
    Dado que FiliaisService lança RECURSO_NAO_ENCONTRADO para F2 no tenant T1
    Quando listo as categorias de F2 como T1
    Então recebo RECURSO_NAO_ENCONTRADO
    E nenhuma consulta de categoria é feita

  Cenário: a consulta sempre filtra por tenant
    Quando listo as categorias de F1 como T1
    Então o where/SQL contém tenant_id = T1 em categorias e em produtos

  Cenário: "hoje" vem do fuso da filial
    Dado a filial em "America/Rio_Branco"
    Quando listo as categorias
    Então hojeDaFilial é chamado com essa filial
    E o valor de hoje é passado como parâmetro da consulta

Funcionalidade: Criar categoria

  Cenário: criação válida
    Dado a filial F1 do tenant T1
    Quando crio a categoria "Mercearia"
    Então Categoria.create recebe { tenantId: T1, filialId: F1, nome: "Mercearia" }
    E o retorno tem contagens zeradas e podeExcluir verdadeiro

  Cenário: filial excluída
    Dado que a filial F1 está excluída
    Quando crio uma categoria em F1
    Então recebo RECURSO_NAO_ENCONTRADO

  Cenário: nome duplicado na mesma filial
    Dado que Categoria.create lança UniqueConstraintError em categorias_filial_nome_uk
    Quando crio a categoria "bebidas"
    Então o erro propaga para o filtro e vira CATEGORIA_JA_EXISTE

Funcionalidade: Renomear categoria

  Cenário: renomear com sucesso
    Dado a categoria C1 de F1
    Quando renomeio para "Frios e Laticínios"
    Então update é chamado com { nome: "Frios e Laticínios" }

  Cenário: mesmo nome
    Dado a categoria C1 chamada "Bebidas"
    Quando renomeio para "Bebidas"
    Então update não é chamado
    E recebo a categoria atual

  Cenário: categoria de outra filial do mesmo tenant
    Dado a categoria C9 pertencente a F2
    Quando renomeio C9 pelo path de F1
    Então recebo RECURSO_NAO_ENCONTRADO

  Cenário: categoria excluída
    Dado a categoria C1 excluída
    Quando renomeio C1
    Então recebo RECURSO_NAO_ENCONTRADO

Funcionalidade: Excluir categoria (RN20)

  Cenário: categoria vazia
    Dado a categoria C1 sem produtos
    Quando excluo C1
    Então Produto.destroy é chamado com { tenantId, categoriaId: C1, filialId: F1 } na transação
    E categoria.destroy é chamado na transação

  Cenário: só produtos vencidos
    Dado C1 com 3 produtos P-vencido
    Quando excluo C1
    Então os 3 produtos são excluídos logicamente
    E C1 é excluída logicamente
    E tudo acontece na mesma transação

  Cenário: com produto vigente
    Dado C1 com P-vigente e P-vencido
    Quando excluo C1
    Então recebo CATEGORIA_COM_PRODUTOS_ATIVOS com detalhes { vigentes: 1, agendados: 0 }
    E nenhum destroy é chamado

  Cenário: com produto agendado
    Dado C1 com P-agendado
    Quando excluo C1
    Então recebo CATEGORIA_COM_PRODUTOS_ATIVOS com detalhes { vigentes: 0, agendados: 1 }

  Cenário: produto no último dia de vigência ainda bloqueia
    Dado C1 com P-vigente-ultimo-dia
    Quando excluo C1
    Então recebo CATEGORIA_COM_PRODUTOS_ATIVOS

  Cenário: mix completo
    Dado C1 com P-vigente, P-vigente-sem-limite, P-agendado, P-vencido e P-excluido
    Quando excluo C1
    Então recebo CATEGORIA_COM_PRODUTOS_ATIVOS com detalhes { vigentes: 2, agendados: 1 }
    E o excluído e o vencido não alteram as contagens de bloqueio

  Cenário: produtos já excluídos não bloqueiam
    Dado C1 apenas com P-excluido
    Quando excluo C1
    Então C1 é excluída

  Cenário: trava pessimista
    Quando excluo C1
    Então a categoria é lida com lock UPDATE dentro da transação

  Cenário: falha no meio desfaz tudo
    Dado C1 só com vencidos
    E categoria.destroy lança erro
    Quando excluo C1
    Então o erro é propagado
    E a transação é revertida (callback rejeitado)

  Cenário: categoria inexistente ou de outro tenant
    Dado que findOne retorna null
    Quando excluo C1
    Então recebo RECURSO_NAO_ENCONTRADO
```

### 12.5 `ProdutosService` (`produtos/services/__tests__/produtos.service.spec.ts`)

Mocks: models `Produto` e `Categoria` (via `CategoriasService` mockado), `FiliaisService`, `VigenciaService`, `AuditoriaService` (`registrarCriacao`, `registrarAlteracoes`), `MidiaService` (`processar`, `salvar`, `urlPublica`), `VERIFICADOR_LIMITES`, `EventEmitter2` e `Sequelize.transaction` (transação falsa que guarda os callbacks de `afterCommit` e os executa só no commit). As funções puras da Fase 2 (`validarCriacao`, `validarEdicaoDeDatas`, `calcularSituacao`) **não** são mockadas: os testes exercitam a integração real com o domínio.

```gherkin
Funcionalidade: Cadastrar produto

  Cenário: cadastro mínimo
    Dado a filial F1 (hoje 2026-10-18) e a categoria C1 de F1
    Quando cadastro { nome: "Leite", categoriaId: C1, precoPromocionalCentavos: 499 }
    Então o produto é criado com dataInicio "2026-10-18" (RN40)
    E dataLimite nulo
    E fotoPath nulo
    E tenantId T1 e filialId F1
    E a situação retornada é VIGENTE

  Cenário: cadastro completo com foto
    Dado uma foto JPEG válida
    Quando cadastro um produto com todos os campos e a foto
    Então MidiaService.processar é chamado com (T1, buffer, "produto")
    E MidiaService.salvar é chamado com (T1, "produto", imagem) e devolve "T1/produto/<uuidv7>.webp"
    E o produto é criado com esse fotoPath
    E salvar acontece antes de abrir a transação

  Cenário: agendamento
    Quando cadastro com dataInicio "2026-10-20" e dataLimite "2026-10-30"
    Então o produto é criado com essas datas
    E a situação retornada é AGENDADO

  Cenário: preço original inválido
    Quando cadastro com promocional 1000 e original 900
    Então recebo PRECO_ORIGINAL_INVALIDO
    E nenhuma imagem é processada
    E nenhum produto é criado

  Cenário: data limite antes do início
    Quando cadastro com dataInicio "2026-10-20" e dataLimite "2026-10-19"
    Então recebo DATA_LIMITE_INVALIDA

  Cenário: data limite no passado
    Quando cadastro com dataLimite "2026-10-17"
    Então recebo DATA_LIMITE_INVALIDA

  Cenário: data limite hoje
    Quando cadastro com dataLimite "2026-10-18"
    Então o produto é criado e está VIGENTE

  Cenário: data de início no passado (D5 da Fase 2)
    Quando cadastro com dataInicio "2026-10-17"
    Então recebo DATA_INICIO_INVALIDA no campo dataInicio
    E nenhuma imagem é processada

  Cenário: categoria de outra filial do mesmo tenant
    Dado a categoria C9 de F2
    Quando cadastro um produto em F1 com categoriaId C9
    Então recebo RECURSO_NAO_ENCONTRADO
    E nenhum produto é criado

  Cenário: categoria excluída
    Dado a categoria C1 excluída
    Quando cadastro com categoriaId C1
    Então recebo RECURSO_NAO_ENCONTRADO

  Cenário: categoria de outro tenant
    Dado a categoria CX do tenant T2
    Quando cadastro em F1 como T1 com categoriaId CX
    Então recebo RECURSO_NAO_ENCONTRADO

  Cenário: filial excluída ou de outro tenant
    Dado que FiliaisService lança RECURSO_NAO_ENCONTRADO
    Quando cadastro um produto
    Então recebo RECURSO_NAO_ENCONTRADO
    E nenhuma imagem é processada

  Cenário: categoria travada em modo compartilhado
    Quando cadastro um produto
    Então obterDaFilial é chamado com lock SHARE na transação

  Cenário: falha no banco depois de salvar a foto (D3.4 da Fase 3)
    Dado uma foto válida
    E Produto.create lança erro
    Quando cadastro o produto
    Então é logado warn com evento "midia.arquivo_orfao" e o caminho salvo
    E nenhum arquivo é apagado do storage
    E o erro original é propagado
    E "filial.conteudo-alterado" não é emitido

  Cenário: imagem inválida
    Dado MidiaService.processar lança IMAGEM_INVALIDA
    Quando cadastro com foto
    Então recebo IMAGEM_INVALIDA
    E MidiaService.salvar não é chamado
    E nenhum produto é criado

  Cenário: gancho de limite consultado
    Quando cadastro um produto
    Então VerificadorLimites.verificarCriacaoProduto é chamado com (T1, F1) na transação antes de create

  Cenário: limite atingido
    Dado que o verificador lança LIMITE_DO_PLANO_ATINGIDO
    E uma foto foi enviada
    Quando cadastro o produto
    Então recebo LIMITE_DO_PLANO_ATINGIDO
    E a foto salva é registrada como órfã no log (não é apagada)

  Cenário: cadastro grava auditoria com valor anterior nulo (D4.11)
    Quando cadastro { precoPromocionalCentavos: 499, precoOriginalCentavos: 599 } sem datas
    Então AuditoriaService.registrarCriacao é chamado com (T1, "PRODUTO", id, { precoPromocionalCentavos: 499, precoOriginalCentavos: 599, dataInicio: "2026-10-18", dataLimite: null }, CAMPOS_AUDITADOS.PRODUTO)
    E na mesma transação do create

  Cenário: cadastro emite evento após o commit (D4.12)
    Quando cadastro um produto com sucesso
    Então "filial.conteudo-alterado" é emitido com { tenantId: T1, filialId: F1 }
    E só no callback afterCommit

  Cenário: cadastro com rollback não emite evento
    Dado Produto.create lança erro
    Quando cadastro o produto
    Então "filial.conteudo-alterado" não é emitido

Funcionalidade: Editar produto (RN26, RNF07)

  Esquema do Cenário: edição conforme a situação
    Dado o produto <rotulo>
    Quando edito o nome para "Novo nome"
    Então <resultado>
    Exemplos:
      | rotulo               | resultado                                |
      | P-vigente            | o produto é atualizado                   |
      | P-vigente-sem-limite | o produto é atualizado                   |
      | P-agendado           | o produto é atualizado                   |
      | P-vencido            | recebo ITEM_NAO_EDITAVEL                 |
      | P-excluido           | recebo ITEM_NAO_EDITAVEL                 |

  Cenário: alterar preço de vigente gera auditoria
    Dado P-vigente com promocional 2199 e original 2649
    Quando edito o promocional para 1999
    Então update recebe { precoPromocionalCentavos: 1999 }
    E registrarAlteracoes é chamado com entidade "PRODUTO", antes 2199, depois 1999, CAMPOS_AUDITADOS.PRODUTO e a mesma transação
    E "filial.conteudo-alterado" é emitido com { tenantId: T1, filialId: F1 } após o commit

  Cenário: alterar só o nome não registra mudança auditada
    Dado P-vigente
    Quando edito o nome
    Então registrarAlteracoes é chamado com antes e depois iguais nos campos auditados
    E a Fase 2 não grava linha (verificado no teste de integração)

  Cenário: edição sem mudança real
    Dado P-vigente com promocional 2199
    Quando edito o promocional para 2199
    Então update não é chamado
    E registrarAlteracoes não é chamado
    E "filial.conteudo-alterado" não é emitido
    E recebo o produto atual

  Cenário: encurtar a data limite de vigente
    Dado P-vigente com dataLimite "2026-10-25"
    Quando edito dataLimite para "2026-10-20"
    Então o produto é atualizado
    E a alteração de dataLimite é auditada

  Cenário: remover a data limite de vigente
    Dado P-vigente com dataLimite "2026-10-25"
    Quando edito dataLimite para null
    Então dataLimite fica nulo
    E a auditoria registra valor anterior "2026-10-25" e novo null

  Cenário: data limite no passado na edição
    Dado P-vigente
    Quando edito dataLimite para "2026-10-17"
    Então recebo DATA_LIMITE_INVALIDA
    E update não é chamado

  Cenário: alterar início de vigente
    Dado P-vigente
    Quando edito dataInicio para "2026-10-12"
    Então recebo DATA_INICIO_IMUTAVEL

  Cenário: reenviar o mesmo início de vigente
    Dado P-vigente com dataInicio "2026-10-10"
    Quando edito com dataInicio "2026-10-10" e o promocional novo
    Então o produto é atualizado sem erro

  Cenário: adiar início de agendado
    Dado P-agendado com início "2026-10-20" e limite "2026-10-30"
    Quando edito dataInicio para "2026-10-22"
    Então o produto é atualizado
    E a alteração de dataInicio é auditada

  Cenário: início de agendado no passado
    Dado P-agendado com início "2026-10-20"
    Quando edito dataInicio para "2026-10-17"
    Então recebo DATA_INICIO_INVALIDA

  Cenário: início de agendado depois do limite atual
    Dado P-agendado com limite "2026-10-30"
    Quando edito dataInicio para "2026-11-02"
    Então recebo DATA_LIMITE_INVALIDA

  Cenário: RN21 com valores resultantes (só original)
    Dado P-vigente com promocional 2199 e original 2649
    Quando edito o original para 2000
    Então recebo PRECO_ORIGINAL_INVALIDO

  Cenário: RN21 com valores resultantes (só promocional)
    Dado P-vigente com promocional 2199 e original 2649
    Quando edito o promocional para 2700
    Então recebo PRECO_ORIGINAL_INVALIDO

  Cenário: subir os dois preços juntos
    Dado P-vigente com promocional 2199 e original 2649
    Quando edito promocional 2700 e original 3000
    Então o produto é atualizado
    E a auditoria registra as duas alterações de preço

  Cenário: remover preço original
    Dado P-vigente com original 2649
    Quando edito original para null
    Então o produto é atualizado e não exibirá "de/por"
    E a auditoria registra 2649 → null

  Cenário: trocar de categoria na mesma filial
    Dado P-vigente na categoria C1 e a categoria C2 de F1
    Quando edito categoriaId para C2
    Então C2 é obtida com lock SHARE
    E o produto passa para C2
    E a resposta traz a categoria C2

  Cenário: trocar para categoria de outra filial
    Dado a categoria C9 de F2
    Quando edito categoriaId para C9
    Então recebo RECURSO_NAO_ENCONTRADO
    E update não é chamado

  Cenário: trocar para categoria excluída
    Dado a categoria C3 excluída
    Quando edito categoriaId para C3
    Então recebo RECURSO_NAO_ENCONTRADO

  Cenário: produto de outra filial no path
    Dado o produto P de F2
    Quando edito P pelo path de F1
    Então recebo RECURSO_NAO_ENCONTRADO

  Cenário: produto de outro tenant
    Dado findOne com { id, tenantId: T1, filialId: F1 } retorna null
    Quando edito
    Então recebo RECURSO_NAO_ENCONTRADO

  Cenário: produto travado durante a edição
    Quando edito um produto
    Então findOne é chamado com lock UPDATE e paranoid false

  Cenário: falha ao auditar desfaz a edição
    Dado registrarAlteracoes lança erro
    Quando edito o preço
    Então o erro é propagado
    E a transação é revertida
    E "filial.conteudo-alterado" não é emitido

  Cenário: produto vence à meia-noite no fuso da filial
    Dado P com dataLimite "2026-10-18" em filial "America/Sao_Paulo"
    E o relógio em 2026-10-19T02:59:59Z (23:59:59 em São Paulo)
    Quando edito o nome
    Então o produto é atualizado
    Mas com o relógio em 2026-10-19T03:00:00Z
    Então recebo ITEM_NAO_EDITAVEL

Funcionalidade: Listar e obter produtos

  Cenário: lista padrão exclui os excluídos
    Quando listo sem filtro de situação
    Então findAndCountAll é chamado com paranoid padrão
    E ordenado por nomeNormalizado e id

  Esquema do Cenário: filtro por situação
    Dado hoje "2026-10-18"
    Quando listo com situacao <situacao>
    Então o where contém <condicao>
    Exemplos:
      | situacao | condicao                                                        |
      | VIGENTE  | dataInicio <= hoje E (dataLimite nulo OU dataLimite >= hoje)    |
      | AGENDADO | dataInicio > hoje                                               |
      | VENCIDO  | dataLimite < hoje                                               |
      | EXCLUIDO | paranoid false E deletedAt não nulo                             |

  Cenário: busca sem acento e com curinga escapado
    Quando listo com busca "Açúcar 100%"
    Então o where contém nomeNormalizado LIKE "%acucar 100\%%"

  Cenário: filtro por categoria
    Quando listo com categoriaId C1
    Então o where contém categoriaId C1, tenantId T1 e filialId F1

  Cenário: paginação
    Quando listo com pagina 3 e porPagina 20
    Então limit é 20 e offset é 40
    E a resposta traz total, pagina e porPagina

  Cenário: obter produto excluído para consulta
    Dado P-excluido
    Quando obtenho o produto
    Então recebo o produto com situação EXCLUIDO e editavel falso

Funcionalidade: Excluir produto

  Esquema do Cenário: exclusão lógica
    Dado o produto <rotulo>
    Quando excluo o produto
    Então <resultado>
    Exemplos:
      | rotulo     | resultado                              |
      | P-vigente  | destroy é chamado (exclusão lógica)    |
      | P-agendado | destroy é chamado                      |
      | P-vencido  | destroy é chamado                      |
      | P-excluido | recebo ITEM_NAO_EDITAVEL               |

  Cenário: exclusão não gera auditoria de preço/data
    Quando excluo P-vigente
    Então registrarAlteracoes não é chamado

  Cenário: exclusão emite evento após o commit
    Quando excluo P-vigente
    Então "filial.conteudo-alterado" é emitido com { tenantId: T1, filialId: F1 } após o commit
```

### 12.6 `ProdutoFotoService`

```gherkin
Funcionalidade: Trocar e remover foto do produto

  Cenário: trocar foto de produto vigente
    Dado P-vigente com fotoPath "T1/produto/antiga.webp"
    Quando envio uma nova foto válida
    Então a nova imagem é processada com perfil "produto" e salva em "T1/produto/<uuidv7>.webp"
    E o produto passa a apontar para o novo caminho
    E nenhum arquivo é apagado do storage (D4.5)
    E "filial.conteudo-alterado" é emitido com { tenantId: T1, filialId: F1 } após o commit

  Esquema do Cenário: trocar foto conforme situação
    Dado o produto <rotulo>
    Quando envio uma nova foto
    Então <resultado>
    Exemplos:
      | rotulo     | resultado                                                   |
      | P-agendado | a foto é trocada                                            |
      | P-vencido  | recebo ITEM_NAO_EDITAVEL e a imagem não é processada        |
      | P-excluido | recebo ITEM_NAO_EDITAVEL e a imagem não é processada        |

  Cenário: produto vence entre o upload e a gravação
    Dado P-vigente na leitura prévia
    E VENCIDO na releitura com lock
    Quando envio uma nova foto
    Então recebo ITEM_NAO_EDITAVEL
    E a foto recém-salva é registrada como órfã no log (warn "midia.arquivo_orfao")
    E "filial.conteudo-alterado" não é emitido

  Cenário: remover foto
    Dado P-vigente com foto
    Quando removo a foto
    Então fotoPath fica nulo
    E o arquivo continua no storage
    E "filial.conteudo-alterado" é emitido após o commit

  Cenário: remover foto de produto sem foto
    Dado P-vigente sem foto
    Quando removo a foto
    Então update não é chamado e recebo 200 com urlFoto nula

  Cenário: produto de outro tenant
    Quando troco a foto de um produto de T2 como T1
    Então recebo RECURSO_NAO_ENCONTRADO
    E a imagem não é processada
```

### 12.7 Cascata e views

```gherkin
Funcionalidade: Exclusão em cascata da filial (RN12)

  Cenário: produtos da filial
    Quando ExclusaoCascataProdutos.excluirPorFilial(T1, F1, { transaction }) é executado
    Então Produto.destroy é chamado com where { tenantId: T1, filialId: F1 } e a mesma transação

  Cenário: categorias da filial
    Quando ExclusaoCascataCategorias.excluirPorFilial(T1, F1, { transaction }) é executado
    Então Categoria.destroy é chamado com where { tenantId: T1, filialId: F1 } e a mesma transação

  Cenário: registro no registry da Fase 2
    Dado os módulos de filiais, produtos e categorias inicializados
    Quando chamo ExclusaoEmCascataFilialRegistry.listar()
    Então a lista contém "produtos" (ordem 10) antes de "categorias" (ordem 20)

Funcionalidade: View de produto

  Esquema do Cenário: situação e flags
    Dado o produto <rotulo> e hoje "2026-10-18"
    Quando gero a view
    Então situacao é <situacao>, editavel é <editavel> e dataInicioEditavel é <inicio>
    Exemplos:
      | rotulo     | situacao | editavel | inicio |
      | P-vigente  | VIGENTE  | true     | false  |
      | P-agendado | AGENDADO | true     | true   |
      | P-vencido  | VENCIDO  | false    | false  |
      | P-excluido | EXCLUIDO | false    | false  |

  Cenário: URL da foto
    Dado fotoPath "T1/produto/x.webp"
    Quando gero a view
    Então urlFoto é MidiaService.urlPublica("T1/produto/x.webp")
    E fotoPath, tenantId e nomeNormalizado não aparecem no JSON

  Cenário: sem foto
    Dado fotoPath nulo
    Quando gero a view
    Então urlFoto é null

  Cenário: preços em centavos
    Dado promocional 2199 e original 2649
    Quando gero a view
    Então precoPromocionalCentavos é 2199 e precoOriginalCentavos é 2649 (números inteiros)

Funcionalidade: View de categoria

  Cenário: contagens convertidas para número
    Dado contagens vindas do Postgres como "12", "3" e "0"
    Quando gero a view
    Então produtos é { vigentes: 12, agendados: 3, vencidos: 0 }
    E podeExcluir é falso
```

### 12.8 Controllers (`__tests__/*.controller.spec.ts`)

Os controllers só são testados no mapeamento. A regra de negócio fica nos services.

```gherkin
Funcionalidade: ProdutosController

  Cenário: POST JSON sem foto
    Dado o tenant T1 no contexto
    Quando chamo criar(F1, dto, undefined)
    Então ProdutosService.criar é chamado com (T1, F1, dto, undefined)
    E a resposta é a ProdutoView com status 201

  Cenário: POST multipart com foto
    Quando chamo criar(F1, dto, arquivo)
    Então ProdutosService.criar recebe { buffer, mimetype, size, originalname } do arquivo

  Cenário: tenantId nunca vem do corpo
    Dado um dto contendo tenantId "T2" (já barrado pelo whitelist)
    Quando chamo criar como T1
    Então o service recebe T1

  Cenário: arquivo acima do limite do Multer
    Dado o interceptor rejeita com LIMIT_FILE_SIZE
    Quando chamo POST /produtos
    Então recebo 413 IMAGEM_MUITO_GRANDE

  Cenário: PUT /foto sem arquivo
    Quando chamo substituirFoto sem arquivo
    Então recebo 400 VALIDACAO_INVALIDA

  Cenário: DELETE devolve 204
    Quando chamo excluir(F1, P1)
    Então ProdutosService.excluir é chamado com (T1, F1, P1) e o status é 204

  Cenário: PATCH devolve 200 com a view
    Quando chamo editar(F1, P1, dto)
    Então ProdutosService.editar é chamado com (T1, F1, P1, dto) e a resposta é a ProdutoView

  Cenário: GET lista repassa a query
    Quando chamo listar(F1, { situacao: "VIGENTE", pagina: 2 })
    Então ProdutosService.listar recebe a query tipada
    E a resposta mapeia cada item pela ProdutoView

Funcionalidade: CategoriasController

  Cenário: POST devolve 201
    Quando chamo criar(F1, { nome: "Mercearia" })
    Então CategoriasService.criar é chamado com (T1, F1, dto) e a resposta é a CategoriaView

  Cenário: DELETE devolve 204
    Quando chamo excluir(F1, C1)
    Então CategoriasService.excluir é chamado com (T1, F1, C1)

  Cenário: UUID inválido no path
    Quando chamo GET /filiais/abc/categorias
    Então recebo 404 RECURSO_NAO_ENCONTRADO
```

## 13. Testes de integração (Testcontainers)

Arquivo `test/integration/categorias-produtos.int-spec.ts`, com migrations reais e relógio fixo em 2026-10-18 (São Paulo).

```gherkin
Funcionalidade: Constraints do banco

  Cenário: CHECK de preço original (RN21)
    Quando insiro direto no banco um produto com promocional 1000 e original 1000
    Então o Postgres recusa com produtos_preco_original_ck

  Cenário: CHECK de preço promocional
    Quando insiro promocional 0
    Então o Postgres recusa com produtos_preco_promocional_ck

  Cenário: CHECK de datas
    Quando insiro dataInicio 2026-10-20 e dataLimite 2026-10-19
    Então o Postgres recusa com produtos_datas_ck

  Cenário: nome de categoria único entre as ativas
    Dado a categoria "Bebidas" em F1
    Quando crio "bébidas" em F1 via API
    Então recebo 409 CATEGORIA_JA_EXISTE

  Cenário: nome repetido depois de excluir
    Dado a categoria "Bebidas" excluída em F1
    Quando crio "Bebidas" em F1
    Então recebo 201

  Cenário: mesmo nome em filiais diferentes
    Dado "Bebidas" em F1
    Quando crio "Bebidas" em F2 do mesmo tenant
    Então recebo 201

  Cenário: DATEONLY volta como string
    Dado um produto com dataLimite 2026-10-25
    Quando leio pelo model
    Então dataLimite é a string "2026-10-25"

Funcionalidade: Fluxos HTTP

  Cenário: cadastro multipart ponta a ponta
    Quando envio POST /produtos multipart com JPEG 1200x1200
    Então recebo 201 com urlFoto apontando para um .webp
    E o arquivo existe no storage de disco (adapter de dev)

  Cenário: listar categorias com contagens reais
    Dado C1 com 1 vigente, 1 agendado, 1 vencido e 1 excluído
    Quando chamo GET /categorias
    Então C1 vem com { vigentes: 1, agendados: 1, vencidos: 1 } e podeExcluir falso

  Cenário: exclusão de categoria com vencidos
    Dado C1 com 2 produtos vencidos
    Quando chamo DELETE /categorias/C1
    Então recebo 204
    E as 3 linhas têm deleted_at preenchido no banco (2 produtos + categoria)

  Cenário: edição auditada
    Quando edito o preço promocional de um produto vigente de 2199 para 1999
    Então existe 1 linha nova em auditoria_alteracoes com entidade "PRODUTO", campo "precoPromocionalCentavos", anterior "2199" e novo "1999" (além das linhas da criação, D4.11)

  Cenário: edição só de nome não audita
    Quando edito só o nome
    Então nenhuma linha nova em auditoria_alteracoes

  Cenário: cascata da filial
    Dado F1 com 2 categorias e 5 produtos
    Quando excluo F1 (rota da Fase 2)
    Então todas as categorias e produtos de F1 têm deleted_at preenchido
    E os de F2 continuam intactos

  Cenário: lojista desativado não escreve
    Dado o lojista T1 DESATIVADO
    Quando chamo POST /produtos, PATCH /produtos/:id, DELETE /categorias/:id e PUT /produtos/:id/foto
    Então todas respondem 403 LOJISTA_DESATIVADO
    E GET /produtos responde 200

  Cenário: concorrência entre excluir categoria e cadastrar produto
    Dado C1 só com vencidos
    Quando disparo em paralelo DELETE /categorias/C1 e POST /produtos com categoriaId C1
    Então exatamente um resultado ocorre:
      | a categoria é excluída e o cadastro recebe 404 |
      | o produto é criado e a exclusão recebe 409     |
    E nunca existe produto não excluído em categoria excluída

  Cenário: hook de tenant cobre as consultas cruas
    Quando inspeciono o SQL de listar categorias (logging do Sequelize)
    Então ele contém o filtro tenant_id para categorias e produtos
```

### Vazamento entre tenants (RNF04)

Arquivo `test/integration/vazamento-categorias-produtos.int-spec.ts`. Lojistas A e B, cada um com filial, categoria e produto. Autenticado como A:

```gherkin
Funcionalidade: Isolamento de categorias e produtos

  Esquema do Cenário: acesso a recurso do outro lojista
    Quando A chama <metodo> <rota> com ids de B
    Então recebe 404 RECURSO_NAO_ENCONTRADO
    E os dados de B no banco continuam iguais
    Exemplos:
      | metodo | rota                                             |
      | GET    | /filiais/{filialB}/categorias                    |
      | POST   | /filiais/{filialB}/categorias                    |
      | PATCH  | /filiais/{filialB}/categorias/{categoriaB}       |
      | DELETE | /filiais/{filialB}/categorias/{categoriaB}       |
      | GET    | /filiais/{filialB}/produtos                      |
      | POST   | /filiais/{filialB}/produtos                      |
      | GET    | /filiais/{filialB}/produtos/{produtoB}           |
      | PATCH  | /filiais/{filialB}/produtos/{produtoB}           |
      | DELETE | /filiais/{filialB}/produtos/{produtoB}           |
      | PUT    | /filiais/{filialB}/produtos/{produtoB}/foto      |
      | DELETE | /filiais/{filialB}/produtos/{produtoB}/foto      |

  Esquema do Cenário: mistura de ids próprios e alheios
    Quando A chama <metodo> <rota>
    Então recebe 404 RECURSO_NAO_ENCONTRADO
    Exemplos:
      | metodo | rota                                                         |
      | GET    | /filiais/{filialA}/produtos/{produtoB}                       |
      | PATCH  | /filiais/{filialA}/categorias/{categoriaB}                   |
      | POST   | /filiais/{filialA}/produtos  (categoriaId = categoriaB)      |
      | PATCH  | /filiais/{filialA}/produtos/{produtoA} (categoriaId = categoriaB) |

  Cenário: busca não vaza
    Dado B tem o produto "Exclusivo B"
    Quando A lista /filiais/{filialA}/produtos?busca=exclusivo
    Então total é 0
```

## 14. Performance e manutenibilidade

| Ponto | Medida |
| --- | --- |
| Lista de categorias | Uma consulta com `COUNT … FILTER` e `GROUP BY`; nenhuma consulta por categoria |
| Lista de produtos | `findAndCountAll` com `include` de categoria em `JOIN` único, `attributes` explícitos, índice parcial `produtos_filial_nome_idx` servindo filtro e ordenação |
| Busca | `LIKE` em `nome_normalizado` sobre o subconjunto da filial (D4.3); meta < 5 ms com 1.000 produtos por filial, medida no teste de integração com `EXPLAIN ANALYZE` registrado no PR |
| Imagem | Processamento e upload **fora** da transação, para a conexão do pool não ficar presa em I/O; `sharp` com perfil `produto` (Fase 3) |
| Exclusões em lote | `destroy` em lote, sem `individualHooks`: um `UPDATE` por tabela |
| Concorrência | Travas pontuais (`FOR SHARE`/`FOR UPDATE`) só na linha da categoria ou do produto, por tempo mínimo |
| Contagens | Retornadas já na listagem (`podeExcluir`), evitando uma chamada extra do front antes de excluir |
| Manutenção | Condições de situação SQL centralizadas em `vigencia/domain/filtro-situacao.ts` (Fase 3), ao lado de `calcularSituacao`; `validarPrecos` puro; services pequenos (`ProdutosService` + `ProdutoFotoService`); limite plugável por token |
| Meta de latência (p95, painel) | `GET /produtos` < 80 ms; `POST /produtos` sem foto < 60 ms; com foto de 3 MB < 800 ms (dominado pelo `sharp` e pelo upload) |

## 15. Checklist de pronto

- [ ] `normalizarParaBusca` e `validarPrecos` com testes (12.1, 12.2)
- [ ] Migrations `criar-categorias` e `criar-produtos` aplicam e revertem do zero
- [ ] CHECKs, índices parciais e índice único de categoria criados exatamente como na seção 6
- [ ] Constraints novas mapeadas no `AppExceptionFilter` e `CATEGORIA_JA_EXISTE` no catálogo
- [ ] Models com `@TenantScoped`, `paranoid` e hook de `nome_normalizado`
- [ ] DTOs com todos os cenários de 12.3
- [ ] `CategoriasService`, `ProdutosService` e `ProdutoFotoService` com todos os cenários de 12.4–12.6
- [ ] Handlers de cascata (produtos 10, categorias 20) registrados no `ExclusaoEmCascataFilialRegistry` (12.7) e teste de integração da cascata
- [ ] Auditoria na criação (D4.11) e evento `filial.conteudo-alterado` após o commit (D4.12), com cenários de rollback sem evento
- [ ] Views sem campos internos (12.7)
- [ ] Controllers (12.8)
- [ ] `VerificadorLimites.verificarCriacaoProduto` (token `VERIFICADOR_LIMITES`, Fase 2) chamado na criação
- [ ] Testes de integração e de vazamento (seção 13) verdes
- [ ] Cobertura ≥ 90% em `services/` e `domain/` dos módulos `categorias` e `produtos`
- [ ] Coleção Postman/`.http` com todas as rotas da fase, incluindo multipart
- [ ] D4.4 (nome de categoria único) confirmado com o produto, ou removido
- [ ] Docs de regras atualizados se alguma decisão desta fase virar regra de negócio
