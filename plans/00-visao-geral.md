# Tabloide Digital API — Visão geral do plano (MVP)

Documento-base das 5 fases. Tudo o que vale para mais de uma fase (stack, arquitetura, convenções, modelo de dados, contrato de erros, estratégia de testes e performance) está aqui. Cada fase referencia este documento em vez de repetir.

Fontes de regra: `docs/Tabloide Digital — Regras de Negócio e Requisitos Não Funcionais (MVP).md` e `docs/Tabloide Digital — Regras de Back-end (MVP).md`. Os códigos RN/RNF citados nos planos são os desses documentos.

## Fases (ordem de importância e dependência)

| Fase | Arquivo | Entrega | Regras principais |
| --- | --- | --- | --- |
| 1 | `fase-1-fundacao-lojista-auth.md` | Projeto, banco, MVC base, isolamento multi-tenant, cadastro/login do lojista, status, endpoint admin | RN01–RN08, RN35 (guard), RN36, RN37, RNF04, RNF05 (login) |
| 2 | `fase-2-filiais-vigencia-auditoria.md` | Filiais, código público + QR Code, fuso, motor de vigência, exclusão lógica em cascata, módulo de auditoria | RN09–RN12, RN24, RN25, RN38, RN39, RN40, RNF06, RNF07 |
| 3 | `fase-3-midia-panfleto-identidade.md` | Upload/otimização de imagens, Supabase Storage, panfleto com não sobreposição, identidade visual | RN06, RN13–RN17, RN26, RN42, RNF02 (imagens), RNF05 (imagens) |
| 4 | `fase-4-categorias-produtos.md` | Categorias e produtos com preços, vigência, edição auditada | RN18–RN22, RN26, RN42, RNF07, RNF09 |
| 5 | `fase-5-pagina-publica-producao.md` | Endpoint público com cache, hardening, limites, observabilidade, deploy Supabase, backup | RN23, RN27–RN32, RN35, RN41, RNF02, RNF03, RNF05, RNF08, RNF12 |

Cada fase só começa com a anterior concluída (critério de pronto atendido e CI verde).

## Stack

| Item | Escolha | Motivo |
| --- | --- | --- |
| Runtime | Node.js 22 LTS | LTS atual |
| Framework | NestJS 11 (TypeScript `strict`) | Decisão do projeto |
| ORM | Sequelize 6 + `sequelize-typescript` + `@nestjs/sequelize` | Decisão do projeto |
| Migrations | `sequelize-cli` (`umzug` por baixo), arquivos em `src/database/migrations` | Versionamento do schema; nunca `sync()` fora de teste |
| Banco | PostgreSQL 16 (Docker local) / Supabase (produção) | Decisão do projeto |
| Imagens | Supabase Storage em produção; disco local em desenvolvimento, atrás da mesma interface (`StoragePort`) | Decisão do projeto; dev sem dependência externa |
| Processamento de imagem | `sharp` | Mais rápido do ecossistema Node (libvips) |
| Hash de senha | `@node-rs/argon2` (argon2id) | Nativo, rápido, recomendação OWASP |
| Auth | `@nestjs/jwt` (access token) | Um login por lojista (RN05) |
| Validação | `class-validator` + `class-transformer` | Padrão Nest |
| Config | `@nestjs/config` + `zod` para validar `.env` na subida | Falha rápida com env inválido |
| Rate limit | `@nestjs/throttler` | RNF05 (tentativas de login) |
| Contexto de request | `nestjs-cls` (AsyncLocalStorage) | Carrega `tenantId` e `requestId` sem passar por todas as camadas |
| Logs | `nestjs-pino` | JSON estruturado e barato |
| Testes | Jest + `@nestjs/testing`; integração com `@testcontainers/postgresql` | BDD em Jest (ver Estratégia de testes) |
| Lint/format | ESLint (typescript-eslint) + Prettier | Manutenibilidade |

## Arquitetura MVC

O NestJS organiza o código em módulos por domínio. Dentro de cada módulo, as camadas MVC ficam assim:

| Camada | Papel | Pasta | Pode depender de |
| --- | --- | --- | --- |
| **Model** | Model Sequelize: tabela, colunas, associações, escopos. Sem regra de negócio | `models/` | nada além do Sequelize |
| **View** | Presenters que transformam model em JSON de resposta (formato, campos expostos, centavos, datas `YYYY-MM-DD`) | `views/` | models, utils |
| **Controller** | HTTP: rota, DTO de entrada, guards, status code; chama service e devolve view | `controllers/` | services, views, dtos |
| Service (apoio ao Controller) | Regras de negócio, transações, validações que precisam de banco | `services/` | models (via `@InjectModel`), outros services, utils |
| DTO | Contrato de entrada validado por `class-validator` | `dtos/` | nada |

Regras de dependência (verificadas em revisão e pelo ESLint com `no-restricted-imports`):

- Controller nunca acessa model diretamente, só via service.
- View nunca chama banco; recebe o model pronto.
- Service nunca devolve model para fora do módulo sem passar por uma view, exceto para outro service.
- Regras puras (vigência, sobreposição, preço) ficam em funções puras em `domain/` ou `common/utils`, fáceis de testar sem mock.

### Estrutura de pastas

```
api/
  docker-compose.yml          # postgres:16 + (opcional) adminer
  .env.example
  package.json
  tsconfig.json
  jest.config.ts              # projects: unit, integration
  .sequelizerc
  plans/                      # estes documentos
  src/
    main.ts
    app.module.ts
    config/
      env.schema.ts           # zod
      app.config.ts
    database/
      database.module.ts
      sequelize.config.ts     # usado pela app e pelo sequelize-cli
      migrations/
      seeders/                # somente dev
      tenant-scope.hooks.ts   # trava de tenant (Fase 1)
    common/
      errors/                 # AppError, catálogo de códigos, filtro global
      guards/                 # JwtAuthGuard, TenantStatusGuard, AdminKeyGuard
      decorators/             # @TenantId(), @Public(), @SomenteLeituraPermitida()
      clock/                  # ClockService (injetável e mockável)
      utils/
        date-only.ts          # hojeNoFuso, comparação de datas sem hora
        money.ts              # centavos <-> string
        text.ts               # normalização para ordenação pt-BR
      tenant/                 # TenantContext (nestjs-cls)
    modules/
      auth/
      lojistas/
      admin/
      filiais/
      vigencia/               # funções puras + VigenciaService
      auditoria/
      midia/                  # StoragePort, adapters, ImageProcessor
      panfletos/
      categorias/
      produtos/
      publico/
      saude/                  # health check (Fase 5)
  test/
    integration/              # Testcontainers
    factories/                # builders de dados de teste
    helpers/
```

Cada módulo de domínio segue:

```
modules/produtos/
  produtos.module.ts
  controllers/produtos.controller.ts
  services/produtos.service.ts
  models/produto.model.ts
  views/produto.view.ts
  dtos/criar-produto.dto.ts
  dtos/editar-produto.dto.ts
  domain/                    # funções puras do módulo (quando houver)
  __tests__/                 # *.spec.ts unitários (BDD)
```

## Convenções

- **Idioma**: termos de domínio em português (`Lojista`, `Filial`, `Panfleto`, `dataLimite`), termos de framework em inglês (`Controller`, `Service`, `Guard`). Tabelas e colunas em `snake_case` português; propriedades TS em `camelCase` (Sequelize com `underscored: true`).
- **IDs**: UUID v7 (`uuid` lib, `v7()`) gerado na aplicação. Não sequencial (RNF05) e ordenável no tempo, o que é bom para índices B-tree.
- **Código público da filial (RN39)**: 8 caracteres de `nanoid/customAlphabet` com alfabeto sem ambíguos (`23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ`, 55 símbolos, cerca de 46 bits). Unique no banco, com retry em colisão.
- **Dinheiro**: sempre inteiro em centavos (`INTEGER`) no banco e no domínio. A API recebe e devolve centavos (`precoPromocionalCentavos`), e o front formata. Nunca `float`.
- **Datas de vigência (RN24)**: `DATEONLY` no banco e string `YYYY-MM-DD` no TS (tipo `DataISO`). A comparação é lexicográfica entre strings `YYYY-MM-DD`, o que dispensa `Date` e fuso no domínio. "Hoje" é calculado por filial com `hojeNoFuso(fuso, agora)` via `Intl.DateTimeFormat('en-CA', { timeZone })`.
- **Relógio**: nenhum código chama `new Date()` direto em regra de negócio. Tudo passa pelo `ClockService.agora()`, mockado nos testes.
- **Exclusão lógica (RN25)**: models de tenant usam `paranoid: true` (`deleted_at`). Cascatas (filial → panfletos, categorias, produtos; categoria → produtos vencidos) são feitas no service, em transação, com `destroy()` em lote, nunca com `ON DELETE CASCADE` físico.
- **Transações**: toda escrita que toca mais de uma linha ou grava auditoria usa `sequelize.transaction()` gerenciada. A transação é passada explicitamente como `{ transaction }` para cada chamada; não usar `Sequelize.useCLS`. Assim fica claro onde ela vale, e fica fácil testar.
- **Rotas**: prefixo global `/v1`.
  - `/v1/auth/*`: cadastro e login (público)
  - `/v1/painel/*`: painel do lojista (JWT)
  - `/v1/publico/*`: página pública (sem auth)
  - `/v1/admin/*`: operações do administrador (`X-Admin-Key`)
- **Paginação** no painel: `?pagina=1&porPagina=50` (máx. 100), resposta `{ itens, total, pagina, porPagina }`.

## Isolamento multi-tenant (RN07, RNF04)

O tenant é o lojista: `tenant_id = lojistas.id`. A defesa tem três camadas:

1. **Origem única do tenant**: o `tenantId` vem só do JWT (`sub`) e é colocado no `TenantContext` (CLS) pelo `JwtAuthGuard`. Nenhuma rota do painel aceita `tenantId` no corpo, na query ou no path.
2. **Service explícito**: todo método de service do painel recebe `tenantId` como primeiro parâmetro e o inclui em todo `where`. Buscar por id é sempre `findOne({ where: { id, tenantId } })`, nunca `findByPk`.
3. **Trava no ORM**: hooks globais `beforeFind`, `beforeCount`, `beforeUpdate`, `beforeBulkUpdate`, `beforeBulkDestroy` e `beforeDestroy` nos models marcados como `@TenantScoped` lançam `TenantScopeViolationError` se o `where` não tiver `tenantId`. A única exceção é o módulo `publico`, que usa `{ skipTenantScope: true }` explicitamente, e esse uso é coberto por teste.

Testes de vazamento (RNF04): para cada recurso do painel, um teste de integração cria lojistas A e B, autentica como A e tenta ler, editar e excluir recursos de B. Todos devem responder `404 RECURSO_NAO_ENCONTRADO`, nunca 403, para não revelar existência.

## Status do lojista (RN02, RN03, RN08, RN35)

A tabela `lojista_ativacoes` (RN03/RN04) guarda o status. Não existe rota para mudá-lo: o administrador altera direto no banco.

| Status | Rotas GET do painel | Rotas de escrita do painel | Página pública |
| --- | --- | --- | --- |
| `AGUARDANDO_ATIVACAO` | permitido | permitido | `404 RECURSO_NAO_ENCONTRADO` |
| `ATIVO` | permitido | permitido | 200 |
| `DESATIVADO` | permitido | `403 LOJISTA_DESATIVADO` | `404 RECURSO_NAO_ENCONTRADO` |

O `TenantStatusGuard` lê o status com cache em memória de 30 s por tenant (LRU, máx. 10 mil entradas). Como a mudança é manual no banco, a propagação leva até 30 s, o que é aceitável e fica documentado.

## Modelo de dados

Todas as tabelas de tenant têm `id uuid PK`, `tenant_id uuid NOT NULL FK lojistas(id)`, `created_at` e `updated_at`, e as que admitem exclusão lógica têm também `deleted_at timestamptz NULL`.

| Tabela | Fase | Colunas principais | Restrições e índices |
| --- | --- | --- | --- |
| `lojistas` | 1 | `nome_fantasia varchar(120)`, `nome_responsavel varchar(120)`, `email citext`, `senha_hash text`, `whatsapp varchar(20)` (E.164), `cnpj char(14) NULL`, `logo_path text NULL`, `cor_primaria char(7) NULL`, `cor_secundaria char(7) NULL` | `UNIQUE(email)` (RN37), `CHECK cor ~ '^#[0-9A-F]{6}$'` |
| `lojista_ativacoes` | 1 | `lojista_id uuid PK FK`, `status enum`, `funcionalidades jsonb DEFAULT '{}'`, `observacao text NULL`, `atualizado_em timestamptz` | criada junto com o lojista, na mesma transação |
| `filiais` | 2 | `nome varchar(120)`, `endereco varchar(300)`, `fuso_horario varchar(64) DEFAULT 'America/Sao_Paulo'`, `codigo_publico varchar(8)` | `UNIQUE(codigo_publico)`; índice `(tenant_id) WHERE deleted_at IS NULL` |
| `auditoria_alteracoes` | 2 | `tenant_id`, `entidade varchar(30)`, `entidade_id uuid`, `campo varchar(40)`, `valor_anterior text NULL`, `valor_novo text NULL`, `alterado_em timestamptz`, `request_id varchar(40)` | append-only; índice `(tenant_id, entidade, entidade_id, alterado_em)` |
| `panfletos` | 3 | `filial_id FK`, `imagem_path text`, `imagem_largura int`, `imagem_altura int`, `data_inicio date NOT NULL`, `data_limite date NULL` | `CHECK (data_limite IS NULL OR data_limite >= data_inicio)`; `EXCLUDE USING gist (filial_id WITH =, daterange(data_inicio, data_limite, '[]') WITH &&) WHERE (deleted_at IS NULL)` (RN16, extensão `btree_gist`) |
| `categorias` | 4 | `filial_id FK`, `nome varchar(80)` | índice `(filial_id) WHERE deleted_at IS NULL` |
| `produtos` | 4 | `filial_id FK`, `categoria_id FK`, `nome varchar(120)`, `quantidade varchar(40) NULL`, `preco_promocional_centavos int`, `preco_original_centavos int NULL`, `descricao varchar(500) NULL`, `observacao varchar(200) NULL`, `foto_path text NULL`, `data_inicio date NOT NULL`, `data_limite date NULL` | `CHECK preco_promocional_centavos > 0`; `CHECK (preco_original_centavos IS NULL OR preco_original_centavos > preco_promocional_centavos)` (RN21); `CHECK` de datas; índice `produtos_filial_ativos_idx (tenant_id, filial_id, data_inicio) WHERE deleted_at IS NULL` |
| `lojista_limites` | 5 | `lojista_id PK FK`, `max_filiais int NULL`, `max_produtos_por_filial int NULL`, `max_imagem_bytes int NULL` | `NULL` = sem limite (RNF12, valores em aberto) |
| `consumidores` | futuro | `tenant_id`, `nome`, `whatsapp` | só documentado (RN33/RN34); **não** criado no MVP |

As restrições do banco (CHECK, EXCLUDE, UNIQUE) duplicam as validações do service de propósito: o service dá a mensagem amigável e o banco garante a regra mesmo sob concorrência.

## Situação de um item com vigência

Função pura compartilhada por panfleto e produto, em `modules/vigencia/domain/situacao.ts`:

```ts
type Situacao = 'AGENDADO' | 'VIGENTE' | 'VENCIDO' | 'EXCLUIDO';

function calcularSituacao(item: { dataInicio: DataISO; dataLimite: DataISO | null; deletedAt: Date | null }, hoje: DataISO): Situacao
// EXCLUIDO se deletedAt != null
// AGENDADO se hoje < dataInicio
// VENCIDO  se dataLimite != null && hoje > dataLimite
// VIGENTE  caso contrário
```

O "vigente" da página pública (RN23) é `lojista ATIVO && situacao === 'VIGENTE'`.

## Contrato de erros

O filtro global `AppExceptionFilter` converte tudo para:

```json
{ "erro": { "codigo": "PANFLETO_PERIODO_SOBREPOSTO", "mensagem": "Já existe um panfleto nesse período.", "detalhes": { "conflitoCom": "…" } } }
```

| Código | HTTP | Uso |
| --- | --- | --- |
| `VALIDACAO_INVALIDA` | 400 | DTO inválido (detalhes por campo) |
| `NAO_AUTENTICADO` | 401 | JWT ausente/inválido |
| `CREDENCIAIS_INVALIDAS` | 401 | Login incorreto (mensagem única para e-mail ou senha) |
| `LOJISTA_DESATIVADO` | 403 | Escrita com lojista desativado |
| `RECURSO_NAO_ENCONTRADO` | 404 | Inexistente, de outro tenant, lojista inativo na pública, admin sem chave |
| `EMAIL_JA_CADASTRADO` | 409 | RN37 |
| `PANFLETO_PERIODO_SOBREPOSTO` | 409 | RN16 |
| `PANFLETO_ATUAL_SEM_DATA_LIMITE` | 409 | RN17 |
| `CATEGORIA_COM_PRODUTOS_ATIVOS` | 409 | RN20 |
| `CATEGORIA_JA_EXISTE` | 409 | Nome de categoria repetido na filial (Fase 4, D4.4) |
| `ITEM_NAO_EDITAVEL` | 409 | RN26 (vencido/excluído) |
| `DATA_INICIO_IMUTAVEL` | 409 | RN26 (início de item já vigente) |
| `PRECO_ORIGINAL_INVALIDO` | 422 | RN21 |
| `DATA_LIMITE_INVALIDA` | 422 | RN42 |
| `DATA_INICIO_INVALIDA` | 422 | Data de início anterior a hoje no fuso da filial (Fase 2, D5) |
| `FUSO_HORARIO_INVALIDO` | 422 | RN38 |
| `IMAGEM_INVALIDA` | 422 | Tipo/conteúdo (RNF05) |
| `IMAGEM_MUITO_GRANDE` | 413 | Tamanho (RNF05/RNF12) |
| `LIMITE_DO_PLANO_ATINGIDO` | 409 | RNF12 |
| `MUITAS_TENTATIVAS` | 429 | Rate limit |
| `ERRO_INTERNO` | 500 | Inesperado (sem detalhes vazados) |
| `ARMAZENAMENTO_INDISPONIVEL` | 503 | Falha ao gravar imagem no storage (Fase 3) |

Erros de constraint do Postgres são traduzidos no filtro: `23505` (unique) e `23P01` (exclusion) viram os códigos de negócio correspondentes, e `23514` (check) vira o código mapeado pelo nome da constraint.

## Estratégia de testes (BDD)

- **Formato**: cada cenário é escrito em Gherkin no plano da fase e implementado em Jest com `describe`/`it` aninhados em português, espelhando o Gherkin:

```ts
describe('Funcionalidade: Cadastro de panfleto (RN16)', () => {
  describe('Cenário: período sobreposto a panfleto agendado', () => {
    describe('Dado um panfleto agendado de 10/11 a 20/11 na filial', () => {
      describe('Quando o lojista cadastra um panfleto de 15/11 a 25/11', () => {
        it('Então recebe PANFLETO_PERIODO_SOBREPOSTO', async () => { /* … */ });
        it('E nenhum panfleto é gravado', async () => { /* … */ });
      });
    });
  });
});
```

- **Pirâmide**:
  - *Unitários* (maioria): funções puras de `domain/` sem mock; services com models mockados (`getModelToken(Model)` + `jest.fn()`), `ClockService` fixo e `StoragePort` falso; controllers testados só para o mapeamento DTO → service → view.
  - *Integração* (`test/integration`, Testcontainers Postgres 16): migrations reais, constraints (CHECK, EXCLUDE, UNIQUE), hooks de tenant, testes de vazamento entre tenants (RNF04) e fluxo HTTP com `supertest`.
- **Builders**: `test/factories/*.factory.ts` com defaults válidos (`umProduto().comDataLimite('2026-11-20').build()`).
- **Relógio fixo** em todo teste com data: `clock.agora.mockReturnValue(new Date('2026-10-18T12:00:00Z'))`.
- **Cobertura mínima** (gate no CI): 90% de linhas e branches em `services/` e `domain/`; 80% global.
- **Nomes de arquivo**: `*.spec.ts` (unitário, ao lado do código em `__tests__/`), `*.int-spec.ts` (integração).
- **Comandos**: `npm run test` (unit), `npm run test:int` (integração), `npm run test:cov`.

## Diretrizes de performance

- Página pública: uma requisição, um JSON, até 3 consultas indexadas executadas em paralelo, cache em memória por código de filial e `Cache-Control`/`ETag` (detalhes na Fase 5).
- Sem N+1: produtos e categorias da página pública vêm em consultas únicas por filial e são agrupados em memória.
- Selecionar só as colunas necessárias (`attributes`) nas consultas quentes; `raw: true` na leitura pública.
- Índices parciais `WHERE deleted_at IS NULL` nas consultas do dia a dia.
- Imagens otimizadas no upload (WebP, dimensões máximas, `sharp`), servidas pela CDN do Supabase com cache longo e nome de arquivo imutável (conteúdo novo gera caminho novo).
- Compressão HTTP (`compression`) e `helmet` na Fase 5.
- Pool do Sequelize dimensionado por env (`DB_POOL_MAX`, padrão 10). No Supabase, usar o pooler (porta 6543, modo transaction) com `prepare: false` quando aplicável.

## Diretrizes de manutenibilidade

- Funções de regra pura em `domain/`, sem dependência de Nest ou Sequelize.
- Um service por agregado; nada de service genérico "faz tudo".
- DTOs com mensagens de validação em português.
- Nenhum número mágico: limites e tamanhos em `config/`.
- Toda decisão relevante registrada no plano da fase. Mudança de regra exige atualizar o documento de regras.
- PR só entra com lint, testes unitários e de integração verdes.

## Critério de pronto (todas as fases)

1. Todos os cenários BDD do plano implementados e passando.
2. Cobertura dentro do gate.
3. Migrations aplicam do zero e revertem (`db:migrate:undo:all`) sem erro.
4. Testes de vazamento entre tenants dos recursos da fase passando.
5. Coleção Postman/`.http` da fase atualizada com exemplos de cada rota.

## Contratos entre fases

Uma interface definida numa fase é a fonte de verdade para as seguintes: as fases posteriores usam exatamente os mesmos nomes e assinaturas, e uma mudança de contrato exige atualizar todos os planos que o consomem.

| Contrato | Arquivo | Define | Consome |
| --- | --- | --- | --- |
| `ClockService.agora()`, `hojeNoFuso(fuso, agora)`, `DataISO`, `compararTextoPtBr`/`collatorPtBr` | `common/clock`, `common/utils/date-only.ts`, `common/utils/text.ts` | 1 | 2, 3, 4, 5 |
| `AppError` + catálogo de códigos, `AppExceptionFilter` (mapa de constraints) | `common/errors` | 1 | 2, 3, 4, 5 |
| `@TenantScoped`, hooks de tenant e `{ skipTenantScope: true }` | `database/tenant-scope.hooks.ts` | 1 | 2, 3, 4, 5 (única exceção: consulta pública por código) |
| `JwtAuthGuard`, `TenantStatusGuard`, `AdminKeyGuard`, `@TenantId()` | `common/guards`, `common/decorators` | 1 | 2, 3, 4, 5 |
| Funções de vigência: `calcularSituacao`, `resolverDataInicio`, `validarDatas`, `validarCriacao`, `validarEdicaoDeDatas(atual, novas, hoje)`, `periodosSeSobrepoem`, `normalizarFuso`; tipo `ResultadoValidacao` | `modules/vigencia/domain` | 2 | 3, 4, 5 |
| `VigenciaService.hojeDaFilial(filial)` | `modules/vigencia/services` | 2 | 3, 4 |
| `FiliaisService.obter(tenantId, id, { transaction?, lock? })` | `modules/filiais/services` | 2 | 4 |
| `ExclusaoEmCascataFilial` (`nome`, `ordem`, `excluirPorFilial`) + `ExclusaoEmCascataFilialRegistry` (registro em `onModuleInit`; produtos 10, categorias 20, panfletos 30) | `modules/filiais/cascata` | 2 | 3, 4 |
| `AuditoriaService.registrarCriacao` / `registrarAlteracoes(..., { transaction })`, `CAMPOS_AUDITADOS` (FILIAL, PANFLETO com `imagemPath`, PRODUTO), entidades `'FILIAL' \| 'PANFLETO' \| 'PRODUTO'` | `modules/auditoria` | 2 | 3, 4 |
| `VERIFICADOR_LIMITES` / `VerificadorLimites` (`verificarCriacaoFilial`, `verificarCriacaoProduto`, `maxImagemBytes`) com o no-op `SemLimitesVerificador` | `common/limites` | 2 | 2, 3, 4; implementação real (`LimitesService`) na 5 |
| Evento `EVENTO_CONTEUDO_ALTERADO = 'filial.conteudo-alterado'`, payload `ConteudoAlteradoEvento { tenantId, filialId? }`, emitido em `afterCommit` | `common/eventos` | 2 | emitido em 2, 3, 4; consumido pelo cache na 5 |
| `MidiaService.processar(tenantId, buffer, perfil)` / `salvar(tenantId, perfil, imagem)` / `urlPublica(caminho)`; `StoragePort` sem remoção; arquivo órfão só logado (`midia.arquivo_orfao`) | `modules/midia` | 3 | 4, 5 |
| `filtroSituacao(situacoes, hoje)` e `condicaoAgendado/Vigente/Vencido(hoje)`; filtro `situacao` em CSV maiúsculo (`AGENDADO,VIGENTE,VENCIDO,EXCLUIDO`) | `modules/vigencia/domain/filtro-situacao.ts` | 3 | 4 |
| Índices `panfletos_periodo_sem_sobreposicao` (GiST) e `produtos_filial_ativos_idx` | migrations | 3, 4 | 5 (consultas públicas) |

## Decisões técnicas tomadas nos planos

Decisões que não estavam nos documentos de regras. As marcadas como **confirmada** eram regra de negócio nova e foram aprovadas pelo produto em 18/10/2026.

| Fase | Decisão | Status |
| --- | --- | --- |
| 1 | JWT HS256 com expiração de 8 h e sem refresh token; trocar a senha não invalida tokens já emitidos (risco aceito no MVP) | técnica |
| 1 | Rate limit: login 5/15 min por IP+e-mail, cadastro 10/h por IP, admin 10/min por IP; armazenamento em memória | técnica |
| 1 | Senha de 8 a 128 caracteres com letra e número; argon2id (19 MiB, t=2, p=1) | técnica |
| 1 | WhatsApp normalizado para E.164 brasileiro; CNPJ com dígitos verificadores validados | técnica |
| 1 | Lojista desativado pode logar (painel só de consulta); o cadastro já devolve o token | técnica |
| 1 | E-mail do lojista não é editável pelo painel no MVP | técnica |
| 2 | D1: código público único inclusive entre filiais excluídas, nunca reaproveitado | técnica |
| 2 | D2: fuso IANA geográfico na forma canônica (sem `UTC`, `Etc/*` ou offsets) | técnica |
| 2 | D3: cascata por registry de handlers com `ordem` | técnica |
| 2 | D5: data de início anterior a hoje é recusada (`DATA_INICIO_INVALIDA`) | **confirmada** |
| 2 | D6: a auditoria grava também a criação (valor anterior nulo), em filial, panfleto e produto | **confirmada** |
| 2 | D7: mudança de fuso da filial é auditada | técnica |
| 2 | D8: `auditoria_alteracoes` só aceita inserção (trigger bloqueia `UPDATE`/`DELETE`) | técnica |
| 2 | D9: evento único `filial.conteudo-alterado`, emitido após o commit | técnica |
| 2 | D10/D11: QR Code gerado sob demanda com ETag; filiais ordenadas por `pt-BR-x-icu` | técnica |
| 2 | Consulta de auditoria de entidade de outro tenant devolve 200 com lista vazia; UUID inválido no path devolve 404 | técnica |
| 3 | D3.1: sem HEIC no MVP (só JPEG, PNG e WebP) | técnica |
| 3 | D3.2: trocar a imagem de panfleto vigente ou agendado é permitido e auditado (`imagemPath`) | **confirmada** |
| 3 | D3.3/D3.4: imagem processada antes da transação; órfão não é apagado, só logado | técnica |
| 3 | D3.5: erro `ARMAZENAMENTO_INDISPONIVEL` (503) | técnica |
| 3 | D3.7: `dataLimite: null` no PATCH remove a data limite | técnica |
| 3 | D3.8: no máximo 2 processamentos de imagem simultâneos por instância | técnica |
| 3 | D3.9/D3.10: auditoria na criação do panfleto (segue D6) e eventos de panfleto e identidade | técnica (depende de D6) |
| 4 | D4.1: produto criado numa requisição só (multipart com foto opcional ou JSON); foto trocada em rota própria | técnica |
| 4 | D4.2/D4.3: coluna `nome_normalizado` para ordenar e buscar; sem `pg_trgm` | técnica |
| 4 | D4.4: nome de categoria único por filial (`CATEGORIA_JA_EXISTE`) | **confirmada** |
| 4 | D4.5: foto antiga mantida no storage | técnica |
| 4 | D4.6: `FOR UPDATE` na categoria ao excluir e `FOR SHARE` ao cadastrar ou mover produto | técnica |
| 4 | D4.8: PATCH com `null` limpa campo opcional; `dataInicio: null` é recusado | técnica |
| 4 | D4.9: flags `editavel` e `dataInicioEditavel` nas views | técnica |
| 4 | D4.10–D4.12: limite via `VERIFICADOR_LIMITES`, auditoria na criação (segue D6) e eventos | técnica (D4.11 depende de D6) |
| 4 | Exclusão de produto vencido permitida; teto de preço R$ 999.999,99 | técnica |
| 5 | Rate limit público de 300 req/min por IP (CGNAT em 4G) | técnica |
| 5 | Cache: LRU por código, TTL até 60 s ou até a meia-noite da filial, cache negativo de 10 s, ETag/304, `max-age=30, stale-while-revalidate=300`; desativação manual leva até cerca de 90 s para tirar a página do ar | técnica |
| 5 | Produtos vencidos não excluídos contam no limite de produtos (RNF12) | **confirmada** |
| 5 | Corrida no limite serializada com `SELECT … FOR UPDATE` em `lojistas` só quando há limite | técnica |
| 5 | Imagem Docker `bookworm-slim`; API no pooler do Supabase (6543) e migrations/backup na porta 5432; PostgREST sem acesso às tabelas | técnica |
| 5 | Backup: `pg_dump` diário criptografado e cópia do bucket para fora do Supabase (ex.: R2), retenção de 30 dias | técnica |
| 5 | Health em `/v1/saude/vivo` e `/v1/saude/pronto`; métricas em `/v1/admin/metricas` com `X-Admin-Key` | técnica |
