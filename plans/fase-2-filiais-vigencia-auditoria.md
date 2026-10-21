# Fase 2 — Filiais, motor de vigência e auditoria

> Base obrigatória: `00-visao-geral.md` (stack, MVC, convenções, isolamento multi-tenant, contrato de erros, estratégia de testes). Este plano não repete o que está lá, só referencia.
> Regras cobertas: RN09, RN10, RN11, RN12, RN24, RN25, RN26 (motor), RN38, RN39, RN40, RN42, RNF06, RNF07 (infraestrutura), gancho para RNF12.

## 1. Objetivo

Entregar a **filial** como vitrine independente, com código público imutável e QR Code. Junto com ela vêm duas peças das quais as Fases 3, 4 e 5 dependem:

1. **Motor de vigência**: funções puras que decidem situação, data de início efetiva, validade das datas, regras de edição e sobreposição de períodos, sempre no fuso da filial.
2. **Auditoria**: registro só de inserção (append-only) das alterações de preço e datas (RNF07), gravado na mesma transação da alteração.

Ao final da fase, o lojista consegue cadastrar, listar, editar e excluir filiais e baixar o QR Code de cada uma. As fases seguintes plugam panfletos, categorias e produtos na exclusão em cascata sem alterar o `FiliaisService`.

## 2. Escopo

### Dentro

- Migration e model `Filial` (RN09, RN10, RN38, RN39).
- CRUD `/v1/painel/filiais`, com exclusão lógica em cascata extensível (RN12, RN25).
- `GET /v1/painel/filiais/:id/qrcode` em SVG ou PNG (RN11).
- Módulo `vigencia`: funções puras (`calcularSituacao`, `resolverDataInicio`, `validarDatas`, `validarEdicaoDeDatas`, `periodosSeSobrepoem`, `normalizarFuso`) e `VigenciaService` (RN24, RN26, RN40, RN42, RNF06).
- Módulo `auditoria`: migration, model `AuditoriaAlteracao`, `AuditoriaService` e `GET /v1/painel/auditoria` (RNF07).
- Validador de DTO `@IsDataISO()` (data `YYYY-MM-DD` válida no calendário).
- Gancho `VERIFICADOR_LIMITES` (implementação nula; a real chega na Fase 5).
- Evento de domínio único `filial.conteudo-alterado` (contrato `ConteudoAlteradoEvento`, seção 10.3.1), emitido após o commit, para a invalidação de cache da Fase 5. As Fases 3 e 4 emitem o mesmo evento.

### Fora (fica para outras fases)

- Panfletos e imagens (Fase 3), categorias e produtos (Fase 4): aqui só existe o **contrato** de cascata que eles vão implementar.
- Página pública e cache (Fase 5).
- Valores de limite por lojista (RNF12, Fase 5).
- Cópia de dados entre filiais (fora do MVP).

## 3. Pré-requisitos (entregues pela Fase 1)

| Item | Usado para |
| --- | --- |
| `ClockService.agora(): Date` | "hoje" de cada filial |
| `hojeNoFuso(fuso, agora): DataISO` em `common/utils/date-only.ts` | Base do motor de vigência |
| `TenantContext` / `ClsService` (nestjs-cls) com `requestId` | `request_id` da auditoria |
| Decorator `@TenantScoped()` + hooks em `database/tenant-scope.hooks.ts` | Trava de tenant nos novos models |
| `AppError` + catálogo + `AppExceptionFilter` (tradução de `23505`/`23514`) | Erros da fase |
| `JwtAuthGuard`, `TenantStatusGuard`, `@TenantId()` | Rotas do painel; escrita bloqueada para `DESATIVADO` |
| `test/factories`, helpers de Testcontainers e de autenticação | Testes |

Dependências novas: `nanoid@5` (ESM; importar via `await import` ou usar `nanoid@3` CJS, ver decisão D4), `qrcode@1` + `@types/qrcode`, `@nestjs/event-emitter@3`, `lru-cache@11` (já presente desde a Fase 1).

Novas variáveis de ambiente (acrescentar em `config/env.schema.ts` e `.env.example`):

| Variável | Validação zod | Exemplo |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | `z.string().url()` sem barra final (`.refine(u => !u.endsWith('/'))`) | `https://tabloide.app` |
| `FUSO_HORARIO_PADRAO` | `z.string().default('America/Sao_Paulo')` + refine `normalizarFuso(v) !== null` | `America/Sao_Paulo` |

## 4. Decisões desta fase

| # | Decisão | Motivo |
| --- | --- | --- |
| D1 | `codigo_publico` é único **inclusive entre filiais excluídas** e nunca é reaproveitado | Um QR Code impresso de uma filial excluída nunca passa a apontar para outra loja |
| D2 | Fuso guardado na forma canônica IANA devolvida por `Intl.DateTimeFormat(...).resolvedOptions().timeZone` (ex.: `america/sao_paulo` vira `America/Sao_Paulo`) | Comparação e exibição consistentes |
| D3 | Cascata via **registro de handlers** (`ExclusaoEmCascataFilialRegistry`): cada módulo registra o seu handler em `onModuleInit`, e a execução segue `ordem` crescente | Fases 3 e 4 se plugam sem alterar `FiliaisService` (aberto/fechado); dispensa `DiscoveryService` e metadados mágicos, e é fácil de testar |
| D4 | Gerador de código atrás da interface `GeradorCodigoPublico` (token `GERADOR_CODIGO_PUBLICO`); implementação com `customAlphabet` do `nanoid` | Mock determinístico nos testes de colisão; isola o problema ESM do nanoid 5 num único arquivo |
| D5 | Data de início informada **anterior a hoje** (no fuso da filial) é recusada com o novo código `DATA_INICIO_INVALIDA` (422) | Cadastrar é publicar (RN40): não faz sentido um início retroativo, que ainda poderia colidir com períodos já vencidos na verificação de sobreposição |
| D6 | A auditoria grava também a **criação** (`valor_anterior = NULL`) dos campos auditados | Pelo CDC, prova o valor ofertado desde o primeiro minuto, não só depois da primeira edição |
| D7 | A mudança de `fuso_horario` da filial é auditada (entidade `FILIAL`) | O fuso altera quando um item entra em vigor e quando vence |
| D8 | `auditoria_alteracoes` é append-only no banco (trigger bloqueia `UPDATE`/`DELETE`) | Integridade da prova de oferta |
| D9 | Evento único `filial.conteudo-alterado` (`{ tenantId, filialId? }`) emitido em `transaction.afterCommit` por todo service que altera algo exibido na página pública | A Fase 5 invalida o cache só quando o dado foi realmente gravado; um evento só evita que cada fase invente o seu |
| D10 | O QR Code é gerado sob demanda (custo de cerca de 1–3 ms), com `Cache-Control: private, max-age=86400` e `ETag` | O código público é imutável, então o QR também é; não precisa de storage |
| D11 | Listagem de filiais ordenada por `nome COLLATE "pt-BR-x-icu"`, depois `id` | Ordem alfabética correta em pt-BR com paginação no banco. O ICU existe na imagem oficial `postgres:16` e no Supabase, e há teste de integração garantindo isso |

Atualizar o catálogo de erros em `00-visao-geral.md` com `DATA_INICIO_INVALIDA` (422, RN40/D5) como parte do PR desta fase.

## 5. Passo a passo de implementação (ordem)

| # | Passo | Arquivos |
| --- | --- | --- |
| 1 | Dependências e variáveis de ambiente | `package.json`, `src/config/env.schema.ts`, `.env.example` |
| 2 | Validador `@IsDataISO()` + função `ehDataISOValida` | `src/common/validators/is-data-iso.validator.ts`, `src/common/utils/date-only.ts` |
| 3 | Funções puras de vigência + testes | `src/modules/vigencia/domain/*.ts`, `src/modules/vigencia/__tests__/*.spec.ts` |
| 4 | `VigenciaService` + módulo | `src/modules/vigencia/services/vigencia.service.ts`, `vigencia.module.ts` |
| 5 | Migration `auditoria_alteracoes` | `src/database/migrations/20261018020100-criar-auditoria-alteracoes.js` |
| 6 | Model, service, view, DTO, controller da auditoria | `src/modules/auditoria/**` |
| 7 | Migration `filiais` | `src/database/migrations/20261018020200-criar-filiais.js` |
| 8 | Model `Filial` | `src/modules/filiais/models/filial.model.ts` |
| 9 | Gerador de código público | `src/modules/filiais/services/gerador-codigo-publico.ts` |
| 10 | Registro de cascata + contrato | `src/modules/filiais/cascata/*.ts` |
| 11 | Gancho de limites | `src/common/limites/verificador-limites.ts` |
| 12 | `FiliaisService` | `src/modules/filiais/services/filiais.service.ts` |
| 13 | `QrCodeService` | `src/modules/filiais/services/qrcode.service.ts` |
| 14 | DTOs, views e controller de filiais | `src/modules/filiais/dtos/*`, `views/*`, `controllers/*` |
| 15 | Mapear constraints no `AppExceptionFilter` | `src/common/errors/constraint-map.ts` |
| 16 | `EventEmitterModule.forRoot()` no `AppModule` | `src/app.module.ts` |
| 17 | Testes de integração (migrations, constraints, vazamento, HTTP) | `test/integration/filiais.int-spec.ts`, `auditoria.int-spec.ts` |
| 18 | Coleção `.http`/Postman da fase | `api/http/fase-2.http` |

## 6. Migrations

### 6.1 `20261018020100-criar-auditoria-alteracoes.js`

```sql
CREATE TABLE auditoria_alteracoes (
  id              uuid PRIMARY KEY,
  tenant_id       uuid        NOT NULL REFERENCES lojistas(id) ON DELETE RESTRICT,
  entidade        varchar(30) NOT NULL,
  entidade_id     uuid        NOT NULL,
  campo           varchar(40) NOT NULL,
  valor_anterior  text        NULL,
  valor_novo      text        NULL,
  alterado_em     timestamptz NOT NULL,
  request_id      varchar(40) NULL,
  CONSTRAINT auditoria_entidade_ck CHECK (entidade IN ('FILIAL','PANFLETO','PRODUTO'))
);

CREATE INDEX auditoria_tenant_entidade_idx
  ON auditoria_alteracoes (tenant_id, entidade, entidade_id, alterado_em DESC);

CREATE FUNCTION auditoria_bloquear_alteracao() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'auditoria_alteracoes é somente inserção' USING ERRCODE = '42501';
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER auditoria_somente_insercao
  BEFORE UPDATE OR DELETE ON auditoria_alteracoes
  FOR EACH ROW EXECUTE FUNCTION auditoria_bloquear_alteracao();
```

`down`: `DROP TRIGGER`, `DROP FUNCTION`, `DROP TABLE`. Não há `created_at`/`updated_at`/`deleted_at`: `alterado_em` é o carimbo.

### 6.2 `20261018020200-criar-filiais.js`

```sql
CREATE TABLE filiais (
  id              uuid PRIMARY KEY,
  tenant_id       uuid         NOT NULL REFERENCES lojistas(id) ON DELETE RESTRICT,
  nome            varchar(120) NOT NULL,
  endereco        varchar(300) NOT NULL,
  fuso_horario    varchar(64)  NOT NULL DEFAULT 'America/Sao_Paulo',
  codigo_publico  varchar(8)   NOT NULL,
  created_at      timestamptz  NOT NULL,
  updated_at      timestamptz  NOT NULL,
  deleted_at      timestamptz  NULL,
  CONSTRAINT filiais_codigo_publico_uk UNIQUE (codigo_publico),
  CONSTRAINT filiais_codigo_publico_formato_ck
    CHECK (codigo_publico ~ '^[2-9a-hjkmnp-zA-HJ-NP-Z]{8}$'),
  CONSTRAINT filiais_nome_nao_vazio_ck CHECK (length(btrim(nome)) > 0),
  CONSTRAINT filiais_endereco_nao_vazio_ck CHECK (length(btrim(endereco)) > 0)
);

CREATE INDEX filiais_tenant_ativas_idx ON filiais (tenant_id) WHERE deleted_at IS NULL;
-- A busca por codigo_publico (Fase 5) usa o índice da UNIQUE.
```

O `CHECK` de formato espelha o alfabeto da visão geral (sem `0 1 i l o I O`). O `UNIQUE` não é parcial, para valer também entre filiais excluídas (D1).

`down`: `DROP TABLE filiais`.

Teste de migração: `db:migrate` seguido de `db:migrate:undo:all` sem erro (critério de pronto).

## 7. Models

### 7.1 `Filial` (`modules/filiais/models/filial.model.ts`)

```ts
@TenantScoped()
@Table({ tableName: 'filiais', underscored: true, paranoid: true, timestamps: true })
export class Filial extends Model<FilialAttrs, FilialCriacaoAttrs> {
  @PrimaryKey @Default(() => uuidv7()) @Column(DataType.UUID) declare id: string;
  @ForeignKey(() => Lojista) @AllowNull(false) @Column(DataType.UUID) declare tenantId: string;
  @AllowNull(false) @Column(DataType.STRING(120)) declare nome: string;
  @AllowNull(false) @Column(DataType.STRING(300)) declare endereco: string;
  @AllowNull(false) @Column(DataType.STRING(64)) declare fusoHorario: string;
  @AllowNull(false) @Column(DataType.STRING(8)) declare codigoPublico: string;
  declare createdAt: Date; declare updatedAt: Date; declare deletedAt: Date | null;
}
```

Sem regra de negócio no model (MVC). Sem associações `hasMany` nesta fase: as Fases 3 e 4 declaram `belongsTo(Filial)` do lado delas e, se precisarem, `Filial.hasMany` no `onModuleInit` do próprio módulo, para não criar dependência circular.

### 7.2 `AuditoriaAlteracao` (`modules/auditoria/models/auditoria-alteracao.model.ts`)

```ts
@TenantScoped()
@Table({ tableName: 'auditoria_alteracoes', underscored: true, timestamps: false, paranoid: false })
export class AuditoriaAlteracao extends Model<...> {
  id: string; tenantId: string;
  entidade: EntidadeAuditada;            // 'FILIAL' | 'PANFLETO' | 'PRODUTO'
  entidadeId: string; campo: string;
  valorAnterior: string | null; valorNovo: string | null;
  alteradoEm: Date; requestId: string | null;
}
```

## 8. Módulo `vigencia` (funções puras)

Arquivos em `modules/vigencia/domain/`. Nenhum importa Nest, Sequelize ou `Date.now()`. Todas recebem `hoje: DataISO` já calculado. Tipos em `vigencia.types.ts`:

```ts
export type DataISO = string;                        // 'YYYY-MM-DD' (da Fase 1)
export type Situacao = 'AGENDADO' | 'VIGENTE' | 'VENCIDO' | 'EXCLUIDO';
export interface ItemComVigencia { dataInicio: DataISO; dataLimite: DataISO | null; deletedAt: Date | null }
export interface Periodo { inicio: DataISO; limite: DataISO | null }   // limite null = infinito
export interface DatasInformadas { dataInicio?: DataISO | null; dataLimite?: DataISO | null } // undefined = não enviado
export type ResultadoValidacao<T> = { ok: true; valor: T } | { ok: false; codigo: CodigoErroVigencia; campo: 'dataInicio' | 'dataLimite' };
export type CodigoErroVigencia = 'DATA_INICIO_INVALIDA' | 'DATA_LIMITE_INVALIDA' | 'ITEM_NAO_EDITAVEL' | 'DATA_INICIO_IMUTAVEL';
```

As funções devolvem `ResultadoValidacao` em vez de lançar exceção. Quem converte em `AppError` é o service, e com isso o domínio fica livre de HTTP.

### 8.1 `normalizarFuso(fuso: string): string | null` (`fuso.ts`)

1. Se não for string, ou for vazia, ou tiver mais de 64 caracteres: `null`.
2. `try { return new Intl.DateTimeFormat('en-US', { timeZone: fuso }).resolvedOptions().timeZone } catch { return null }`.
3. Recusa offsets fixos e abreviações que o `Intl` aceita (`UTC`, `GMT`, `+03:00`, `Etc/GMT+3`): só valem fusos que contêm `/` e não começam com `Etc/`. **Exceção**: nenhuma. Filial brasileira sempre tem fuso geográfico.
4. Memoização num `Map<string, string | null>` com até 500 entradas, porque construir o `Intl.DateTimeFormat` é a parte cara.

### 8.2 `calcularSituacao(item, hoje): Situacao` (`situacao.ts`)

A ordem de avaliação é obrigatória:

1. `item.deletedAt !== null` → `EXCLUIDO`.
2. `hoje < item.dataInicio` → `AGENDADO`.
3. `item.dataLimite !== null && hoje > item.dataLimite` → `VENCIDO`.
4. caso contrário → `VIGENTE`.

A comparação é lexicográfica entre strings `YYYY-MM-DD`. Isso já implementa a RN24: como `hoje` é a data local da filial, o início vale a partir das 00:00 e o limite até as 23:59:59.999 locais.

### 8.3 `resolverDataInicio(informada, hoje): ResultadoValidacao<DataISO>` (`datas.ts`)

- `informada` `undefined` ou `null` → `ok(hoje)` (RN40).
- `informada < hoje` → `erro(DATA_INICIO_INVALIDA, 'dataInicio')` (D5).
- caso contrário → `ok(informada)` (hoje ou futuro).

### 8.4 `validarDatas(inicio, limite, hoje): ResultadoValidacao<Periodo>` (`datas.ts`)

Recebe o início já resolvido.
- `limite === null` → `ok({ inicio, limite: null })`.
- `limite < inicio` → `erro(DATA_LIMITE_INVALIDA, 'dataLimite')` (RN42).
- `limite < hoje` → `erro(DATA_LIMITE_INVALIDA, 'dataLimite')` (RN42).
- caso contrário → `ok`. `limite === inicio` é válido (vale um dia só).

### 8.5 `validarCriacao(informadas, hoje): ResultadoValidacao<Periodo>` (`datas.ts`)

Composição: `resolverDataInicio` e depois `validarDatas`. É o ponto de entrada do cadastro de panfleto (Fase 3) e de produto (Fase 4).

### 8.6 `validarEdicaoDeDatas(atual, novas, hoje): ResultadoValidacao<Periodo>` (`edicao.ts`)

Entrada: `atual: ItemComVigencia`; `novas: DatasInformadas`, em que `undefined` significa "não alterar" e `null` em `dataLimite` significa "remover limite".

Algoritmo:
1. `s = calcularSituacao(atual, hoje)`.
2. `s ∈ {EXCLUIDO, VENCIDO}` → `erro(ITEM_NAO_EDITAVEL)` (RN26). Vale mesmo que `novas` esteja vazio: o service só chama esta função quando há qualquer edição. A guarda geral de "item vencido não é editável" fica no service (ver 10.x nas Fases 3/4) e usa `calcularSituacao` diretamente.
3. Início:
   - `novas.dataInicio === undefined` → `inicio = atual.dataInicio`.
   - `s === VIGENTE` e `novas.dataInicio !== atual.dataInicio` (incluindo `null`) → `erro(DATA_INICIO_IMUTAVEL)` (RN26). Enviar o mesmo valor atual é aceito (idempotente).
   - `s === AGENDADO` → `inicio = resolverDataInicio(novas.dataInicio, hoje)`. `null` significa "publicar agora" e vira `hoje`; data passada dá erro.
4. Limite: `novas.dataLimite === undefined` → `limite = atual.dataLimite`; senão `limite = novas.dataLimite` (pode ser `null`).
5. `validarDatas(inicio, limite, hoje)`. Num item vigente, o limite pode ser encurtado até `hoje` (vale até as 23:59 de hoje), mas não para ontem.
6. Devolve o período final. **Não** verifica sobreposição; isso é da Fase 3, com `periodosSeSobrepoem`.

> Observação: um limite já existente com valor anterior a hoje não existe em item editável, porque o item seria `VENCIDO`. Por isso, reenviar um `dataLimite` inalterado nunca esbarra na RN42 de forma indevida.

### 8.7 `periodosSeSobrepoem(a: Periodo, b: Periodo): boolean` (`periodos.ts`)

Intervalos fechados `[inicio, limite]`, com `limite null = +∞`:

```
a.inicio <= (b.limite ?? '9999-12-31') && b.inicio <= (a.limite ?? '9999-12-31')
```

Encostar conta como sobreposição: `a.limite === b.inicio` sobrepõe, porque os dois valeriam no mesmo dia. `a.limite = 10/11` e `b.inicio = 11/11` não sobrepõem. A constante `INFINITO = '9999-12-31'` fica exportada. É a mesma semântica do `daterange(..., '[]')` da `EXCLUDE` da Fase 3.

### 8.8 `VigenciaService` (`modules/vigencia/services/vigencia.service.ts`)

```ts
@Injectable()
export class VigenciaService {
  constructor(private readonly clock: ClockService) {}
  hojeDaFilial(filial: Pick<Filial, 'fusoHorario'>): DataISO       // hojeNoFuso(filial.fusoHorario, clock.agora())
  situacaoDe(item: ItemComVigencia, filial: Pick<Filial,'fusoHorario'>): Situacao
}
```

O `ClockService.agora()` é lido uma vez por chamada. Quem precisa de "hoje" para vários itens da mesma filial (Fase 5) chama `hojeDaFilial` uma vez e reaproveita o valor.

`VigenciaModule` exporta `VigenciaService`. As funções puras são importadas diretamente, sem injeção.

## 9. Módulo `auditoria`

### 9.1 `AuditoriaService` (`modules/auditoria/services/auditoria.service.ts`)

```ts
export type EntidadeAuditada = 'FILIAL' | 'PANFLETO' | 'PRODUTO';
export type ValorAuditavel = string | number | null | undefined;

@Injectable()
export class AuditoriaService {
  constructor(
    @InjectModel(AuditoriaAlteracao) private readonly model: typeof AuditoriaAlteracao,
    private readonly clock: ClockService,
    private readonly cls: ClsService,
  ) {}

  registrarAlteracoes(
    tenantId: string, entidade: EntidadeAuditada, entidadeId: string,
    antes: Record<string, ValorAuditavel>, depois: Record<string, ValorAuditavel>,
    camposAuditados: readonly string[], opts: { transaction: Transaction },
  ): Promise<number>;

  registrarCriacao(
    tenantId: string, entidade: EntidadeAuditada, entidadeId: string,
    valores: Record<string, ValorAuditavel>, camposAuditados: readonly string[],
    opts: { transaction: Transaction },
  ): Promise<number>;            // = registrarAlteracoes(..., antes = {}, depois = valores)

  listar(tenantId: string, filtro: { entidade: EntidadeAuditada; entidadeId: string; pagina: number; porPagina: number }): Promise<{ itens: AuditoriaAlteracao[]; total: number }>;
}
```

Algoritmo de `registrarAlteracoes`:
1. `opts.transaction` é obrigatório. Sem ele, lança `Error('auditoria exige transação')`, um erro de programação que vira 500. Isso garante que a auditoria nunca fique fora da transação da alteração.
2. `serializar(v)`: `undefined | null` vira `null`; `number` vira `String(v)` (centavos inteiros); `string` fica como está.
3. Para cada `campo` de `camposAuditados`, na ordem recebida, quando `campo in depois` (campo enviado): `ant = serializar(antes[campo])` e `nov = serializar(depois[campo])`; se `ant !== nov`, acumula a linha.
4. Nenhuma linha → retorna `0` **sem** ir ao banco.
5. `alteradoEm = clock.agora()` (o mesmo instante para todas as linhas da chamada), `requestId = cls.getId() ?? null`.
6. Um único `bulkCreate(linhas, { transaction, returning: false, validate: false })`: um `INSERT` multi-linha.
7. Retorna o número de linhas.

Campos ignorados: qualquer chave fora de `camposAuditados` (nome, descrição etc. não são auditados; o RNF07 cobre preço e datas, e a imagem do panfleto entra porque contém os preços, D3.2 da Fase 3).

Constantes de campos auditados (exportadas para as fases seguintes):

```ts
export const CAMPOS_AUDITADOS = {
  FILIAL:   ['fusoHorario'],
  PANFLETO: ['dataInicio', 'dataLimite', 'imagemPath'],   // imagemPath: Fase 3, D3.2 (a imagem contém os preços)
  PRODUTO:  ['precoPromocionalCentavos', 'precoOriginalCentavos', 'dataInicio', 'dataLimite'],
} as const;
```

`listar`: `findAndCountAll({ where: { tenantId, entidade, entidadeId }, order: [['alteradoEm','DESC'],['id','DESC']], limit, offset, attributes: [exceto tenantId] })`. Usa o índice `auditoria_tenant_entidade_idx`.

### 9.2 DTO `ListarAuditoriaQueryDto`

| Campo | Validação | Mensagem |
| --- | --- | --- |
| `entidade` | `@IsIn(['FILIAL','PANFLETO','PRODUTO'])` obrigatório | "entidade deve ser FILIAL, PANFLETO ou PRODUTO" |
| `entidadeId` | `@IsUUID('7')` obrigatório | "entidadeId inválido" |
| `pagina` | `@Type(() => Number) @IsInt() @Min(1)`, padrão 1 | "pagina deve ser inteiro ≥ 1" |
| `porPagina` | `@Type(() => Number) @IsInt() @Min(1) @Max(100)`, padrão 50 | "porPagina deve estar entre 1 e 100" |

### 9.3 Rota

`GET /v1/painel/auditoria?entidade=PRODUTO&entidadeId=0192...&pagina=1&porPagina=50` (JWT; leitura permitida inclusive para `DESATIVADO`).

```json
200
{
  "itens": [
    { "id": "0192…", "entidade": "PRODUTO", "entidadeId": "0192…", "campo": "precoPromocionalCentavos",
      "valorAnterior": "899", "valorNovo": "799", "alteradoEm": "2026-10-18T15:04:05.000Z", "requestId": "a1b2…" }
  ],
  "total": 1, "pagina": 1, "porPagina": 50
}
```

Entidade inexistente ou de outro tenant → `200` com `itens: []`. Não é 404, porque o filtro por tenant já impede o vazamento e a resposta vazia não revela existência. Query inválida → `400 VALIDACAO_INVALIDA`.

View `AuditoriaAlteracaoView.de(model)`: expõe exatamente os campos acima, com `alteradoEm` em ISO-8601 UTC. Nunca expõe `tenantId`.

## 10. Módulo `filiais`

### 10.1 Gerador de código público

```ts
export const GERADOR_CODIGO_PUBLICO = Symbol('GERADOR_CODIGO_PUBLICO');
export interface GeradorCodigoPublico { gerar(): string }
export const ALFABETO_CODIGO = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
export const TAMANHO_CODIGO = 8;
// NanoidGeradorCodigoPublico: customAlphabet(ALFABETO_CODIGO, TAMANHO_CODIGO)
```

### 10.2 Contrato de cascata (`modules/filiais/cascata/`)

```ts
export interface ExclusaoEmCascataFilial {
  readonly nome: string;          // 'produtos', 'categorias', 'panfletos' (logs e testes)
  readonly ordem: number;         // menor executa antes (produtos 10, categorias 20, panfletos 30)
  excluirPorFilial(tenantId: string, filialId: string, opts: { transaction: Transaction }): Promise<number>;
}

@Injectable()
export class ExclusaoEmCascataFilialRegistry {
  private readonly handlers: ExclusaoEmCascataFilial[] = [];
  registrar(handler: ExclusaoEmCascataFilial): void;   // recusa nome duplicado (Error de programação)
  listar(): readonly ExclusaoEmCascataFilial[];        // cópia ordenada por ordem, depois nome
}
```

Como as fases seguintes se plugam (exemplo da Fase 4):

```ts
@Module({ imports: [FiliaisModule, ...] })
export class ProdutosModule implements OnModuleInit {
  constructor(private readonly registry: ExclusaoEmCascataFilialRegistry, private readonly cascata: ProdutosCascataFilial) {}
  onModuleInit() { this.registry.registrar(this.cascata); }
}
```

O handler implementa a exclusão com `Model.destroy({ where: { tenantId, filialId }, transaction })`. Isso é uma exclusão lógica em lote (`paranoid`): um `UPDATE ... SET deleted_at` só. `FiliaisModule` exporta o registry e não importa nenhum módulo de fase posterior.

### 10.3 Gancho de limites (RNF12)

```ts
// common/limites/verificador-limites.ts
export const VERIFICADOR_LIMITES = Symbol('VERIFICADOR_LIMITES');
export interface VerificadorLimites {
  /** Chamar DENTRO da transação de criação. Lança LIMITE_DO_PLANO_ATINGIDO. Usado pela Fase 2. */
  verificarCriacaoFilial(tenantId: string, opts: { transaction: Transaction }): Promise<void>;
  /** Chamar DENTRO da transação de criação. Lança LIMITE_DO_PLANO_ATINGIDO. Usado pela Fase 4. */
  verificarCriacaoProduto(tenantId: string, filialId: string, opts: { transaction: Transaction }): Promise<void>;
  /** Teto de bytes de imagem para o lojista, antes do processamento. Usado pela Fase 3 (MidiaService.processar). */
  maxImagemBytes(tenantId: string): Promise<number>;
}
export class SemLimitesVerificador implements VerificadorLimites {
  constructor(private readonly config: AppConfig) {}
  async verificarCriacaoFilial() {}
  async verificarCriacaoProduto() {}
  async maxImagemBytes() { return this.config.maxImagemBytes; } // MAX_IMAGEM_BYTES (Fase 3); até lá, 10 MB
}
```

`LimitesModule` (global, `src/common/limites/limites.module.ts`) fornece `SemLimitesVerificador` no token `VERIFICADOR_LIMITES` a partir desta fase. A interface já nasce completa: as Fases 3 e 4 só **consomem** os métodos delas, sem alterar o contrato. A Fase 5 troca o provider por `LimitesService` (que implementa `VerificadorLimites`) sem tocar em nenhum service consumidor.

#### 10.3.1 Evento de conteúdo alterado (contrato para as Fases 3–5)

```ts
// common/eventos/conteudo-alterado.event.ts
export const EVENTO_CONTEUDO_ALTERADO = 'filial.conteudo-alterado';
export interface ConteudoAlteradoEvento {
  tenantId: string;
  filialId?: string;   // ausente = afeta todas as filiais do tenant (ex.: identidade visual, Fase 3)
}
```

Regras para todo emissor (Fases 2–4):
- Emitir **só** em `transaction.afterCommit(...)`. Em operação sem transação explícita (ex.: `update` único da identidade visual), emitir depois do `await` da escrita bem-sucedida.
- Rollback ou erro → nada é emitido.
- O payload não leva `codigoPublico`: o cache da Fase 5 mantém o índice `filialId → código` e `tenantId → códigos`.
- `EventEmitterModule.forRoot()` é registrado nesta fase (passo 16); quem consome é a Fase 5 (`@OnEvent(EVENTO_CONTEUDO_ALTERADO)`).

### 10.4 DTOs

`CriarFilialDto`

| Campo | Tipo | Obrigatório | Validação | Transformação | Mensagem |
| --- | --- | --- | --- | --- | --- |
| `nome` | string | sim | `@IsString() @Length(1,120)` + `@NaoVazio()` (após trim) | `trim()`, colapsa espaços internos repetidos | "nome é obrigatório e deve ter até 120 caracteres" |
| `endereco` | string | sim | `@IsString() @Length(1,300)` + `@NaoVazio()` | `trim()` | "endereço é obrigatório e deve ter até 300 caracteres" |
| `fusoHorario` | string | não | `@IsOptional() @IsString() @MaxLength(64)` | nenhuma (a validação de fuso é feita no service) | — |

`EditarFilialDto`: os mesmos três campos, todos `@IsOptional()`, mais um `@ValidateIf` de classe que exige pelo menos um campo (corpo vazio → `400 VALIDACAO_INVALIDA`, "informe ao menos um campo"). Campos desconhecidos (`codigoPublico`, `tenantId`, `id`) → `400`, pelo `forbidNonWhitelisted` global. Isso garante que o código público seja imutável (RN39).

`QrCodeQueryDto`

| Campo | Validação | Padrão |
| --- | --- | --- |
| `formato` | `@IsOptional() @IsIn(['svg','png'])` | `svg` |
| `tamanho` | `@IsOptional() @Type(() => Number) @IsInt() @Min(128) @Max(2048)` (só para PNG; ignorado em SVG) | `512` |
| `download` | `@IsOptional() @IsIn(['0','1'])` | `0` |

`IdParamDto`: `@IsUUID('7')`. UUID inválido → `404 RECURSO_NAO_ENCONTRADO`, e não 400, para não diferenciar "formato errado" de "não existe". Isso é feito com um `ParseUuidOu404Pipe` criado nesta fase em `common/pipes`.

### 10.5 `FiliaisService` (`modules/filiais/services/filiais.service.ts`)

```ts
@Injectable()
export class FiliaisService {
  constructor(
    @InjectModel(Filial) private readonly filialModel: typeof Filial,
    private readonly sequelize: Sequelize,
    @Inject(GERADOR_CODIGO_PUBLICO) private readonly gerador: GeradorCodigoPublico,
    private readonly cascata: ExclusaoEmCascataFilialRegistry,
    @Inject(VERIFICADOR_LIMITES) private readonly limites: VerificadorLimites,
    private readonly auditoria: AuditoriaService,
    private readonly eventos: EventEmitter2,
    private readonly config: AppConfig,
  ) {}

  listar(tenantId: string, p: { pagina: number; porPagina: number }): Promise<{ itens: Filial[]; total: number }>;
  obter(tenantId: string, id: string, opts?: { transaction?: Transaction; lock?: Transaction['LOCK'][keyof Transaction['LOCK']] }): Promise<Filial>; // 404 se não achar; usado também pelas Fases 4 e 5
  criar(tenantId: string, dto: CriarFilialDto): Promise<Filial>;
  editar(tenantId: string, id: string, dto: EditarFilialDto): Promise<Filial>;
  excluir(tenantId: string, id: string): Promise<void>;
}
```

Constante: `MAX_TENTATIVAS_CODIGO = 5`.

**`listar`**: `findAndCountAll({ where: { tenantId }, attributes: ['id','nome','endereco','fusoHorario','codigoPublico','createdAt','updatedAt'], order: [[literal('nome COLLATE "pt-BR-x-icu"'),'ASC'],['id','ASC']], limit: porPagina, offset: (pagina-1)*porPagina })`. O `paranoid` já exclui as filiais excluídas.

**`obter`**: `findOne({ where: { id, tenantId }, transaction: opts?.transaction, lock: opts?.lock })`; `null` → `AppError(RECURSO_NAO_ENCONTRADO)`. Filial excluída também dá 404 (paranoid). É o ponto único para outras fases validarem que a filial do path é do tenant (a Fase 4 usa com `{ transaction }`).

**`criar`**:
1. `fuso = normalizarFuso(dto.fusoHorario ?? config.fusoHorarioPadrao)`. `null` → `AppError(FUSO_HORARIO_INVALIDO, { campo: 'fusoHorario' })`. Essa verificação acontece **antes** de abrir a transação.
2. `sequelize.transaction(async t => { ... })`:
   1. `await limites.verificarCriacaoFilial(tenantId, { transaction: t })`.
   2. Laço de 1 a `MAX_TENTATIVAS_CODIGO`: `codigo = gerador.gerar()`; `create({ id: uuidv7(), tenantId, nome, endereco, fusoHorario: fuso, codigoPublico: codigo }, { transaction: t })`.
      - `UniqueConstraintError` **na constraint `filiais_codigo_publico_uk`** → tenta de novo. Para isso o `create` roda dentro de um `SAVEPOINT`: `sequelize.transaction({ transaction: t }, …)` aninhada, o que evita abortar a transação externa.
      - Outro erro → relança.
      - Esgotou as tentativas → `Error('falha ao gerar código público único')` (500, com log `error`). A probabilidade disso é desprezível com cerca de 46 bits.
   3. `auditoria.registrarCriacao(tenantId, 'FILIAL', filial.id, { fusoHorario: fuso }, CAMPOS_AUDITADOS.FILIAL, { transaction: t })`.
   4. `t.afterCommit(() => eventos.emit(EVENTO_CONTEUDO_ALTERADO, { tenantId, filialId: filial.id }))`.
3. Retorna a filial.

**`editar`**:
1. Se `dto.fusoHorario !== undefined`: `fuso = normalizarFuso(dto.fusoHorario)`; `null` → `FUSO_HORARIO_INVALIDO`.
2. Transação: `filial = findOne({ where: { id, tenantId }, transaction: t, lock: t.LOCK.UPDATE })`; `null` → `404`.
3. `antes = { fusoHorario: filial.fusoHorario }`; aplica os campos enviados; `filial.save({ transaction: t, fields: camposEnviados })`. Sem campos alterados de fato, o Sequelize não emite `UPDATE` (`changed()` vazio), o que é aceitável.
4. `auditoria.registrarAlteracoes(tenantId, 'FILIAL', id, antes, { fusoHorario: filial.fusoHorario }, CAMPOS_AUDITADOS.FILIAL, { transaction: t })`, só se `fusoHorario` foi enviado.
5. `afterCommit` → `EVENTO_CONTEUDO_ALTERADO` com `{ tenantId, filialId: id }`.

**`excluir`** (RN12, RN25):
1. Transação: `filial = findOne({ where: { id, tenantId }, transaction: t, lock: t.LOCK.UPDATE })`; `null` → `404`. O lock serializa a exclusão com edições e com cadastros concorrentes de itens filhos, que nas Fases 3 e 4 também tomam `FOR SHARE`/`FOR UPDATE` da filial.
2. `for (const h of cascata.listar()) { const n = await h.excluirPorFilial(tenantId, id, { transaction: t }); log.debug({ handler: h.nome, n }) }`, sequencialmente, na ordem definida.
3. `filial.destroy({ transaction: t })` (lógico).
4. `afterCommit` → `eventos.emit(EVENTO_CONTEUDO_ALTERADO, { tenantId, filialId: id })`.
5. Qualquer erro em um handler faz rollback de tudo: a filial e todos os filhos continuam ativos.

A confirmação da exclusão é responsabilidade do front-end (RN12). O back-end não pede um parâmetro de confirmação.

### 10.6 `QrCodeService` (`modules/filiais/services/qrcode.service.ts`)

```ts
@Injectable()
export class QrCodeService {
  constructor(private readonly config: AppConfig) {}
  urlPublica(codigoPublico: string): string;          // `${PUBLIC_BASE_URL}/f/${codigoPublico}`
  gerar(codigoPublico: string, formato: 'svg' | 'png', tamanho: number):
    Promise<{ conteudo: Buffer | string; contentType: 'image/svg+xml' | 'image/png'; etag: string }>;
}
```

- Opções do `qrcode`: `errorCorrectionLevel: 'M'`, `margin: 2`, `color: { dark: '#000000', light: '#FFFFFF' }`. Fica sempre em preto sobre branco, mesmo com a identidade visual do lojista, porque a leitura com qualquer câmera vem antes da estética.
- SVG: `QRCode.toString(url, { type: 'svg', ... })`. PNG: `QRCode.toBuffer(url, { type: 'png', width: tamanho, ... })`.
- `etag = W/"<sha1(codigo|formato|tamanho|PUBLIC_BASE_URL)>"`, calculado **sem** gerar a imagem. Assim o controller responde 304 antes do trabalho.

### 10.7 Views

`FilialView.de(filial, qr: QrCodeService)`:

```json
{
  "id": "0192f0c2-…",
  "nome": "Centro",
  "endereco": "Rua A, 100 — Centro, Belém/PA",
  "fusoHorario": "America/Belem",
  "codigoPublico": "k7Qm2xPa",
  "urlPublica": "https://tabloide.app/f/k7Qm2xPa",
  "criadaEm": "2026-10-18T15:00:00.000Z",
  "atualizadaEm": "2026-10-18T15:00:00.000Z"
}
```

Nunca expõe `tenantId` nem `deletedAt`. `FilialView.lista(resultado, pagina, porPagina)` devolve `{ itens, total, pagina, porPagina }`.

### 10.8 Controller e rotas (`FiliaisController`, `@Controller('painel/filiais')`)

Todas as rotas usam `JwtAuthGuard` e `TenantStatusGuard` (as escritas devolvem `403` para `DESATIVADO`) e pegam o tenant com `@TenantId()`.

| Método | Rota | Status OK | Erros |
| --- | --- | --- | --- |
| GET | `/v1/painel/filiais?pagina&porPagina` | 200 | 400, 401 |
| GET | `/v1/painel/filiais/:id` | 200 | 401, 404 |
| POST | `/v1/painel/filiais` | 201 + `Location: /v1/painel/filiais/:id` | 400, 401, 403, 409 `LIMITE_DO_PLANO_ATINGIDO` (Fase 5), 422 `FUSO_HORARIO_INVALIDO` |
| PATCH | `/v1/painel/filiais/:id` | 200 | 400, 401, 403, 404, 422 |
| DELETE | `/v1/painel/filiais/:id` | 204 | 401, 403, 404 |
| GET | `/v1/painel/filiais/:id/qrcode?formato&tamanho&download` | 200 / 304 | 400, 401, 404 |

Exemplos:

```http
POST /v1/painel/filiais
Authorization: Bearer <jwt>
Content-Type: application/json

{ "nome": "  Centro  ", "endereco": "Rua A, 100", "fusoHorario": "america/belem" }
```
```json
201
{ "id": "0192…", "nome": "Centro", "endereco": "Rua A, 100", "fusoHorario": "America/Belem",
  "codigoPublico": "k7Qm2xPa", "urlPublica": "https://tabloide.app/f/k7Qm2xPa",
  "criadaEm": "…", "atualizadaEm": "…" }
```

```json
422
{ "erro": { "codigo": "FUSO_HORARIO_INVALIDO", "mensagem": "Fuso horário inválido.", "detalhes": { "campo": "fusoHorario" } } }
```

```http
PATCH /v1/painel/filiais/0192…
{ "codigoPublico": "AAAAAAAA" }
```
```json
400
{ "erro": { "codigo": "VALIDACAO_INVALIDA", "mensagem": "Dados inválidos.", "detalhes": { "codigoPublico": ["campo não permitido"] } } }
```

QR Code:

```http
GET /v1/painel/filiais/0192…/qrcode?formato=png&tamanho=1024&download=1
If-None-Match: W/"3f7a…"
```

- `If-None-Match` igual ao ETag → `304` sem corpo e sem gerar a imagem.
- Senão → `200`, com os headers `Content-Type`, `ETag`, `Cache-Control: private, max-age=86400`, `Content-Disposition: inline` (ou `attachment; filename="qrcode-<codigo>.png"` quando `download=1`).
- A ordem no controller é: `obter` (404 de outro tenant), depois `etag`, depois a comparação, e só então `gerar`.

### 10.9 `FiliaisModule`

```ts
@Module({
  imports: [SequelizeModule.forFeature([Filial]), AuditoriaModule, VigenciaModule],
  controllers: [FiliaisController],
  providers: [FiliaisService, QrCodeService, ExclusaoEmCascataFilialRegistry,
              { provide: GERADOR_CODIGO_PUBLICO, useClass: NanoidGeradorCodigoPublico }],
  exports: [FiliaisService, ExclusaoEmCascataFilialRegistry, SequelizeModule],
})
```

### 10.10 Mapa de constraints (`AppExceptionFilter`)

| Constraint | Código |
| --- | --- |
| `filiais_nome_nao_vazio_ck`, `filiais_endereco_nao_vazio_ck` | `VALIDACAO_INVALIDA` |
| `filiais_codigo_publico_uk` | nunca chega ao filtro (tratada no retry); se chegar, `ERRO_INTERNO` |
| `filiais_codigo_publico_formato_ck` | `ERRO_INTERNO` (bug do gerador) |

## 11. Performance e manutenibilidade

- `normalizarFuso` memoizado (8.1). `hojeNoFuso` (Fase 1) deve reutilizar um `Intl.DateTimeFormat` por fuso, em cache num `Map`. Se a Fase 1 não fez isso, ajustar nesta fase, com teste.
- Comparação de datas por string: nenhuma alocação de `Date` no caminho quente (Fase 5).
- Exclusão em cascata em lote: um `UPDATE` por tabela filha, nunca um por item.
- Auditoria: no máximo um `INSERT` por operação, e zero quando nada mudou.
- QR Code: 304 por ETag sem processamento; geração em memória, sem I/O.
- Listagem: índice parcial `filiais_tenant_ativas_idx`; `attributes` explícitos; `findAndCountAll` (a contagem é barata, porque um lojista tem poucas filiais).
- Domínio puro (`vigencia/domain`) sem dependências, reutilizado por Fases 3, 4 e 5. Uma regra de data só existe em um lugar.
- A cascata é aberta para extensão e fechada para modificação (D3). Esquecer de registrar um handler é pego pelo teste de integração da cascata de cada fase seguinte.

## 12. Testes unitários (BDD)

Convenção da visão geral: Gherkin abaixo, implementado em Jest com `describe`/`it` aninhados. Relógio fixo, salvo indicação: `2026-10-18T12:00:00Z`, que é 09:00 em São Paulo (UTC-3) e 08:00 em Manaus (UTC-4).

### 12.1 `normalizarFuso` (`vigencia/__tests__/fuso.spec.ts`)

```gherkin
Funcionalidade: Normalização de fuso horário (RN38)

  Esquema do Cenário: fusos aceitos e normalizados
    Dado o fuso informado "<entrada>"
    Quando normalizo o fuso
    Então recebo "<saida>"
    Exemplos:
      | entrada             | saida               |
      | America/Sao_Paulo   | America/Sao_Paulo   |
      | america/sao_paulo   | America/Sao_Paulo   |
      | America/Manaus      | America/Manaus      |
      | America/Rio_Branco  | America/Rio_Branco  |
      | America/Noronha     | America/Noronha     |
      | America/Belem       | America/Belem       |

  Esquema do Cenário: fusos recusados
    Dado o fuso informado "<entrada>"
    Quando normalizo o fuso
    Então recebo nulo
    Exemplos:
      | entrada              |
      | Marte/Olympus        |
      |                      |
      | UTC                  |
      | GMT                  |
      | Etc/GMT+3            |
      | +03:00               |
      | BRT                  |
      | <string com 65 chars>|

  Cenário: entrada não string
    Dado o valor 123 como fuso
    Quando normalizo o fuso
    Então recebo nulo

  Cenário: memoização
    Dado que "America/Manaus" já foi normalizado uma vez
    Quando normalizo "America/Manaus" de novo
    Então Intl.DateTimeFormat não é construído novamente
```

### 12.2 `calcularSituacao` (`vigencia/__tests__/situacao.spec.ts`)

```gherkin
Funcionalidade: Situação de item com vigência (RN23, RN24, RN25)

  Esquema do Cenário: situação por datas (hoje = 2026-10-18)
    Dado um item com início "<inicio>", limite "<limite>" e não excluído
    Quando calculo a situação para hoje "2026-10-18"
    Então a situação é "<situacao>"
    Exemplos:
      | inicio     | limite     | situacao |
      | 2026-10-19 | nulo       | AGENDADO |
      | 2026-10-19 | 2026-10-25 | AGENDADO |
      | 2026-10-18 | nulo       | VIGENTE  |
      | 2026-10-18 | 2026-10-18 | VIGENTE  |
      | 2026-10-01 | 2026-10-18 | VIGENTE  |
      | 2026-10-01 | nulo       | VIGENTE  |
      | 2026-10-01 | 2026-10-17 | VENCIDO  |
      | 2025-12-31 | 2026-01-01 | VENCIDO  |

  Cenário: item excluído prevalece sobre qualquer data
    Dado um item vigente por datas com deletedAt preenchido
    Quando calculo a situação
    Então a situação é "EXCLUIDO"

  Cenário: item excluído e agendado
    Dado um item com início no futuro e deletedAt preenchido
    Quando calculo a situação
    Então a situação é "EXCLUIDO"

  Cenário: virada de ano
    Dado um item com início "2026-12-31" e limite "2027-01-01"
    Quando calculo a situação para hoje "2027-01-01"
    Então a situação é "VIGENTE"
    E para hoje "2027-01-02" a situação é "VENCIDO"

  Cenário: ano bissexto
    Dado um item com limite "2028-02-29"
    Quando calculo a situação para "2028-02-29"
    Então a situação é "VIGENTE"
    E para "2028-03-01" a situação é "VENCIDO"
```

### 12.3 Bordas de fuso (`vigencia/__tests__/vigencia-fuso.spec.ts`, usa `hojeNoFuso` + `calcularSituacao`)

```gherkin
Funcionalidade: Vigência avaliada no fuso da filial (RN24, RNF06)

  Cenário: 23:30 em Manaus ainda é o dia anterior ao de São Paulo
    Dado o instante "2026-10-19T03:30:00Z"
    E um item com limite "2026-10-18"
    Quando avalio na filial de fuso "America/Manaus" (23:30 do dia 18)
    Então a situação é "VIGENTE"
    E quando avalio na filial de fuso "America/Sao_Paulo" (00:30 do dia 19)
    Então a situação é "VENCIDO"

  Cenário: início vale a partir de 00:00 local
    Dado um item com início "2026-10-19"
    E o instante "2026-10-19T02:59:59Z"
    Quando avalio em "America/Sao_Paulo" (23:59:59 do dia 18)
    Então a situação é "AGENDADO"
    E no instante "2026-10-19T03:00:00Z" (00:00 do dia 19) a situação é "VIGENTE"

  Cenário: limite vale até 23:59:59 local
    Dado um item com limite "2026-10-18"
    Quando avalio em "America/Sao_Paulo" no instante "2026-10-19T02:59:59Z"
    Então a situação é "VIGENTE"
    E no instante "2026-10-19T03:00:00Z" a situação é "VENCIDO"

  Cenário: virada de dia em UTC não afeta a filial
    Dado o instante "2026-10-19T00:30:00Z" (21:30 do dia 18 em São Paulo)
    E um item com limite "2026-10-18"
    Quando avalio em "America/Sao_Paulo"
    Então a situação é "VIGENTE"

  Cenário: Fernando de Noronha (UTC-2) vira o dia antes
    Dado o instante "2026-10-19T02:30:00Z"
    E um item com limite "2026-10-18"
    Quando avalio em "America/Noronha" (00:30 do dia 19)
    Então a situação é "VENCIDO"
    E em "America/Sao_Paulo" (23:30 do dia 18) a situação é "VIGENTE"

  Cenário: data histórica com horário de verão usa as regras do tzdata
    Dado o instante "2019-01-15T02:30:00Z" (horário de verão em São Paulo, UTC-2)
    Quando calculo hoje em "America/Sao_Paulo"
    Então hoje é "2019-01-15" (em UTC-3 seria "2019-01-14")
    # Garante que a lib usa a regra correta da época; para datas atuais, o Brasil não tem horário de verão

  Cenário: mesma filial, várias avaliações no mesmo request usam o mesmo "hoje"
    Dado o VigenciaService com relógio fixo
    Quando chamo hojeDaFilial duas vezes para a mesma filial
    Então ClockService.agora é chamado uma vez por chamada e os resultados são iguais
```

### 12.4 `resolverDataInicio`, `validarDatas` e `validarCriacao` (`vigencia/__tests__/datas.spec.ts`)

```gherkin
Funcionalidade: Datas na criação (RN15, RN40, RN42)

  Contexto:
    Dado que hoje na filial é "2026-10-18"

  Cenário: sem data de início vale a partir de hoje (RN40)
    Quando resolvo a data de início com valor ausente
    Então recebo ok "2026-10-18"

  Cenário: data de início nula também vira hoje
    Quando resolvo a data de início com null
    Então recebo ok "2026-10-18"

  Cenário: início hoje é aceito
    Quando resolvo a data de início "2026-10-18"
    Então recebo ok "2026-10-18"

  Cenário: início futuro é aceito (agendamento)
    Quando resolvo a data de início "2026-11-01"
    Então recebo ok "2026-11-01"

  Cenário: início no passado é recusado (D5)
    Quando resolvo a data de início "2026-10-17"
    Então recebo erro "DATA_INICIO_INVALIDA" no campo "dataInicio"

  Cenário: sem data limite é válido (RN15)
    Quando valido início "2026-10-18" e limite nulo
    Então recebo ok com limite nulo

  Cenário: limite igual ao início é válido (um dia)
    Quando valido início "2026-10-20" e limite "2026-10-20"
    Então recebo ok

  Cenário: limite anterior ao início é recusado (RN42)
    Quando valido início "2026-10-20" e limite "2026-10-19"
    Então recebo erro "DATA_LIMITE_INVALIDA" no campo "dataLimite"

  Cenário: limite anterior a hoje é recusado (RN42)
    Dado início "2026-10-18"
    Quando valido limite "2026-10-17"
    Então recebo erro "DATA_LIMITE_INVALIDA"

  Cenário: limite hoje é válido
    Quando valido início "2026-10-18" e limite "2026-10-18"
    Então recebo ok

  Cenário: validarCriacao compõe início ausente com limite futuro
    Quando valido a criação com início ausente e limite "2026-10-31"
    Então recebo ok { inicio: "2026-10-18", limite: "2026-10-31" }

  Cenário: validarCriacao interrompe no erro de início
    Quando valido a criação com início "2026-10-01" e limite "2026-09-01"
    Então recebo erro "DATA_INICIO_INVALIDA" (o primeiro erro encontrado)
```

### 12.5 `validarEdicaoDeDatas` (`vigencia/__tests__/edicao.spec.ts`)

```gherkin
Funcionalidade: Edição de datas (RN26, RN42)

  Contexto:
    Dado que hoje na filial é "2026-10-18"

  Cenário: item vencido não é editável
    Dado um item de "2026-10-01" a "2026-10-17"
    Quando edito o limite para "2026-10-30"
    Então recebo erro "ITEM_NAO_EDITAVEL"

  Cenário: item excluído não é editável
    Dado um item vigente excluído
    Quando edito o limite para "2026-10-30"
    Então recebo erro "ITEM_NAO_EDITAVEL"

  Cenário: vigente — alterar início é proibido
    Dado um item de "2026-10-10" sem limite
    Quando edito o início para "2026-10-20"
    Então recebo erro "DATA_INICIO_IMUTAVEL"

  Cenário: vigente — início null também é alteração proibida
    Dado um item vigente iniciado em "2026-10-10"
    Quando edito o início para null
    Então recebo erro "DATA_INICIO_IMUTAVEL"

  Cenário: vigente — reenviar o mesmo início é aceito
    Dado um item vigente iniciado em "2026-10-10"
    Quando edito o início para "2026-10-10" e o limite para "2026-10-25"
    Então recebo ok { inicio: "2026-10-10", limite: "2026-10-25" }

  Cenário: vigente — encurtar limite até hoje
    Dado um item de "2026-10-10" a "2026-10-30"
    Quando edito o limite para "2026-10-18"
    Então recebo ok com limite "2026-10-18"

  Cenário: vigente — limite para ontem é recusado
    Dado um item de "2026-10-10" a "2026-10-30"
    Quando edito o limite para "2026-10-17"
    Então recebo erro "DATA_LIMITE_INVALIDA"

  Cenário: vigente — remover limite
    Dado um item de "2026-10-10" a "2026-10-30"
    Quando edito o limite para null
    Então recebo ok com limite nulo

  Cenário: vigente — sem campos de data enviados mantém o período
    Dado um item de "2026-10-10" a "2026-10-30"
    Quando edito sem enviar datas
    Então recebo ok { inicio: "2026-10-10", limite: "2026-10-30" }

  Cenário: agendado — antecipar início para hoje
    Dado um item de "2026-10-25" a "2026-10-30"
    Quando edito o início para "2026-10-18"
    Então recebo ok com início "2026-10-18"

  Cenário: agendado — início null publica agora (RN40)
    Dado um item agendado para "2026-10-25"
    Quando edito o início para null
    Então recebo ok com início "2026-10-18"

  Cenário: agendado — início no passado é recusado
    Dado um item agendado para "2026-10-25"
    Quando edito o início para "2026-10-17"
    Então recebo erro "DATA_INICIO_INVALIDA"

  Cenário: agendado — adiar início para depois do limite atual
    Dado um item de "2026-10-25" a "2026-10-30"
    Quando edito apenas o início para "2026-11-05"
    Então recebo erro "DATA_LIMITE_INVALIDA" (limite atual < novo início)

  Cenário: agendado — adiar início e limite juntos
    Dado um item de "2026-10-25" a "2026-10-30"
    Quando edito o início para "2026-11-05" e o limite para "2026-11-10"
    Então recebo ok { inicio: "2026-11-05", limite: "2026-11-10" }

  Cenário: item que começa hoje é vigente (não agendado)
    Dado um item com início "2026-10-18"
    Quando edito o início para "2026-10-19"
    Então recebo erro "DATA_INICIO_IMUTAVEL"
```

### 12.6 `periodosSeSobrepoem` (`vigencia/__tests__/periodos.spec.ts`)

```gherkin
Funcionalidade: Sobreposição de períodos fechados (base da RN16/RN17)

  Esquema do Cenário: pares de períodos
    Dado o período A de "<a_ini>" a "<a_lim>"
    E o período B de "<b_ini>" a "<b_lim>"
    Quando verifico a sobreposição
    Então o resultado é <sobrepoe>
    E o resultado é o mesmo com A e B trocados
    Exemplos:
      | a_ini      | a_lim      | b_ini      | b_lim      | sobrepoe |
      | 2026-11-01 | 2026-11-10 | 2026-11-11 | 2026-11-20 | false    |
      | 2026-11-01 | 2026-11-10 | 2026-11-10 | 2026-11-20 | true     |
      | 2026-11-01 | 2026-11-10 | 2026-11-05 | 2026-11-07 | true     |
      | 2026-11-01 | 2026-11-10 | 2026-10-25 | 2026-11-01 | true     |
      | 2026-11-01 | 2026-11-10 | 2026-10-01 | 2026-10-31 | false    |
      | 2026-11-01 | nulo       | 2027-05-01 | 2027-05-10 | true     |
      | 2026-11-01 | nulo       | 2026-10-01 | 2026-10-31 | false    |
      | 2026-11-01 | nulo       | 2026-12-01 | nulo       | true     |
      | 2026-11-01 | 2026-11-01 | 2026-11-01 | 2026-11-01 | true     |
      | 2026-11-01 | 2026-11-01 | 2026-11-02 | 2026-11-02 | false    |

  Cenário: constante de infinito
    Então INFINITO é "9999-12-31" e é maior que qualquer data válida usada no sistema
```

### 12.7 `@IsDataISO()` (`common/validators/__tests__/is-data-iso.spec.ts`)

```gherkin
Funcionalidade: Validação de data sem hora (RN24)

  Esquema do Cenário: valores
    Dado o valor "<valor>"
    Quando valido com IsDataISO
    Então o resultado é <valido>
    Exemplos:
      | valor                     | valido |
      | 2026-10-18                | true   |
      | 2028-02-29                | true   |
      | 2026-02-29                | false  |
      | 2026-13-01                | false  |
      | 2026-04-31                | false  |
      | 2026-10-18T00:00:00Z      | false  |
      | 18/10/2026                | false  |
      | 2026-1-8                  | false  |
      | (número 20261018)         | false  |

  Cenário: null é aceito quando o campo é anulável
    Dado o decorator com { anulavel: true }
    Quando valido null
    Então é válido
```

### 12.8 `AuditoriaService` (`auditoria/__tests__/auditoria.service.spec.ts`)

```gherkin
Funcionalidade: Registro de alterações (RNF07)

  Contexto:
    Dado o relógio em "2026-10-18T12:00:00Z"
    E o requestId "req-1" no contexto
    E o model de auditoria mockado

  Cenário: grava só os campos auditados que mudaram
    Dado antes { precoPromocionalCentavos: 899, nome: "Arroz", dataLimite: "2026-10-30" }
    E depois { precoPromocionalCentavos: 799, nome: "Arroz 5kg", dataLimite: "2026-10-30" }
    Quando registro alterações de PRODUTO com os campos auditados de PRODUTO
    Então um único bulkCreate é chamado com 1 linha
    E a linha tem campo "precoPromocionalCentavos", anterior "899", novo "799"
    E alteradoEm é "2026-10-18T12:00:00Z" e requestId é "req-1"
    E a função retorna 1

  Cenário: várias mudanças na mesma chamada viram um único INSERT
    Dado mudança de preço promocional, preço original e data limite
    Quando registro alterações
    Então bulkCreate é chamado uma vez com 3 linhas, na ordem dos campos auditados
    E todas as linhas têm o mesmo alteradoEm

  Cenário: nada mudou
    Dado antes e depois iguais nos campos auditados
    Quando registro alterações
    Então bulkCreate não é chamado
    E a função retorna 0

  Cenário: campo não enviado não é auditado
    Dado depois sem a chave dataLimite
    Quando registro alterações
    Então dataLimite não gera linha, mesmo sendo auditado

  Cenário: remover data limite
    Dado antes { dataLimite: "2026-10-30" } e depois { dataLimite: null }
    Quando registro alterações
    Então a linha tem anterior "2026-10-30" e novo nulo

  Cenário: definir data limite onde não havia
    Dado antes { dataLimite: null } e depois { dataLimite: "2026-10-30" }
    Então a linha tem anterior nulo e novo "2026-10-30"

  Cenário: preço original removido
    Dado antes { precoOriginalCentavos: 1299 } e depois { precoOriginalCentavos: null }
    Então a linha tem anterior "1299" e novo nulo

  Cenário: undefined e null são equivalentes
    Dado antes { precoOriginalCentavos: undefined } e depois { precoOriginalCentavos: null }
    Então nenhuma linha é gravada

  Cenário: número e string iguais não geram diferença falsa
    Dado antes { precoPromocionalCentavos: 799 } e depois { precoPromocionalCentavos: 799 }
    Então nenhuma linha é gravada

  Cenário: registro de criação
    Dado valores { precoPromocionalCentavos: 799, precoOriginalCentavos: null, dataInicio: "2026-10-18", dataLimite: null }
    Quando registro a criação de PRODUTO
    Então são gravadas linhas apenas para os campos com valor não nulo: preço promocional e data de início
    E todas têm valor anterior nulo

  Cenário: transação é obrigatória
    Quando registro alterações sem transação
    Então é lançado erro "auditoria exige transação"
    E bulkCreate não é chamado

  Cenário: transação é repassada ao bulkCreate
    Quando registro alterações com a transação T
    Então bulkCreate recebe { transaction: T }

  Cenário: sem requestId no contexto
    Dado que o CLS não tem id
    Quando registro alterações
    Então requestId é nulo

  Cenário: listar filtra por tenant, entidade e id, do mais recente para o mais antigo
    Quando listo a auditoria do tenant "T1", entidade PRODUTO, id "P1", página 2 com 10 por página
    Então findAndCountAll recebe where { tenantId: "T1", entidade: "PRODUTO", entidadeId: "P1" }
    E order [[alteradoEm, DESC], [id, DESC]], limit 10, offset 10
```

### 12.9 `AuditoriaController` (`auditoria/__tests__/auditoria.controller.spec.ts`)

```gherkin
Funcionalidade: Consulta de auditoria

  Cenário: repassa o tenant do token e devolve a view paginada
    Dado o tenant "T1" no token
    Quando GET /v1/painel/auditoria?entidade=PRODUTO&entidadeId=<uuid>
    Então o service é chamado com ("T1", { entidade, entidadeId, pagina: 1, porPagina: 50 })
    E a resposta tem itens sem tenantId e alteradoEm em ISO-8601

  Cenário: entidade inválida
    Quando entidade=CATEGORIA
    Então 400 VALIDACAO_INVALIDA e o service não é chamado

  Cenário: porPagina acima de 100
    Quando porPagina=101
    Então 400 VALIDACAO_INVALIDA

  Cenário: tenantId na query é rejeitado
    Quando envio tenantId=T2 na query
    Então 400 VALIDACAO_INVALIDA (forbidNonWhitelisted)
```

### 12.10 `ExclusaoEmCascataFilialRegistry` (`filiais/__tests__/cascata.registry.spec.ts`)

```gherkin
Funcionalidade: Registro de handlers de exclusão em cascata (RN12)

  Cenário: lista ordenada por ordem
    Dado handlers registrados na ordem: panfletos(30), produtos(10), categorias(20)
    Quando listo
    Então recebo produtos, categorias, panfletos

  Cenário: empate de ordem desempata por nome
    Dado handlers "b"(10) e "a"(10)
    Quando listo
    Então recebo "a", "b"

  Cenário: nome duplicado
    Dado um handler "produtos" registrado
    Quando registro outro handler "produtos"
    Então é lançado erro de programação "handler de cascata duplicado: produtos"

  Cenário: listar devolve cópia
    Quando altero o array retornado por listar
    Então o registro interno não muda

  Cenário: registro vazio
    Quando listo sem handlers
    Então recebo lista vazia
```

### 12.11 `FiliaisService` (`filiais/__tests__/filiais.service.spec.ts`)

Mocks: `filialModel` (`findAndCountAll`, `findOne`, `create`), `sequelize.transaction` executando o callback com uma transação fake que guarda os callbacks de `afterCommit`, `gerador.gerar`, `registry.listar`, `limites.verificarCriacaoFilial`, `auditoria.registrarCriacao/registrarAlteracoes`, `eventos.emit`, `config.fusoHorarioPadrao = 'America/Sao_Paulo'`.

```gherkin
Funcionalidade: Gestão de filiais

  # ---------- criar ----------
  Cenário: cria filial com fuso padrão (RN38)
    Dado o tenant "T1" e o gerador devolvendo "k7Qm2xPa"
    Quando crio a filial { nome: "Centro", endereco: "Rua A, 100" }
    Então create recebe { tenantId: "T1", nome: "Centro", endereco: "Rua A, 100", fusoHorario: "America/Sao_Paulo", codigoPublico: "k7Qm2xPa" } com a transação
    E id é um UUID v7
    E a auditoria registra a criação de FILIAL com fusoHorario "America/Sao_Paulo"
    E após o commit é emitido "filial.conteudo-alterado" com { tenantId, filialId }

  Cenário: normaliza o fuso informado
    Quando crio com fusoHorario "america/manaus"
    Então a filial é criada com "America/Manaus"

  Cenário: fuso inválido
    Quando crio com fusoHorario "Marte/Olympus"
    Então recebo AppError FUSO_HORARIO_INVALIDO com detalhes { campo: "fusoHorario" }
    E nenhuma transação é aberta
    E create não é chamado

  Cenário: verifica limites antes de criar (gancho RNF12)
    Quando crio uma filial
    Então verificarCriacaoFilial("T1", { transaction }) é chamado antes de create

  Cenário: limite atingido
    Dado o verificador lançando LIMITE_DO_PLANO_ATINGIDO
    Quando crio uma filial
    Então recebo LIMITE_DO_PLANO_ATINGIDO
    E create não é chamado
    E nenhum evento é emitido

  Cenário: colisão de código público é retentada (RN39)
    Dado o gerador devolvendo "AAAAAAAA" e depois "BBBBBBBB"
    E create falhando com UniqueConstraintError em "filiais_codigo_publico_uk" na primeira vez
    Quando crio a filial
    Então create é chamado 2 vezes
    E a filial é criada com "BBBBBBBB"

  Cenário: colisões esgotam as tentativas
    Dado create sempre falhando com UniqueConstraintError em "filiais_codigo_publico_uk"
    Quando crio a filial
    Então create é chamado 5 vezes
    E é lançado erro interno "falha ao gerar código público único"
    E nenhum evento é emitido

  Cenário: outro erro de unicidade não é retentado
    Dado create falhando com UniqueConstraintError em outra constraint
    Quando crio a filial
    Então o erro é relançado
    E create é chamado 1 vez

  Cenário: evento só após commit
    Dado a transação falhando no commit
    Quando crio a filial
    Então "filial.conteudo-alterado" não é emitido

  # ---------- listar / obter ----------
  Cenário: lista paginada do tenant
    Quando listo a página 2 com 10 por página do tenant "T1"
    Então findAndCountAll recebe where { tenantId: "T1" }, limit 10, offset 10
    E a ordenação é por nome com collation pt-BR e depois por id
    E attributes não incluem tenantId nem deletedAt

  Cenário: obter filial do tenant
    Dado a filial "F1" do tenant "T1"
    Quando obtenho "F1" como "T1"
    Então findOne recebe where { id: "F1", tenantId: "T1" }
    E recebo a filial

  Cenário: obter filial inexistente ou de outro tenant
    Dado findOne retornando null
    Quando obtenho "F9" como "T1"
    Então recebo AppError RECURSO_NAO_ENCONTRADO

  # ---------- editar ----------
  Cenário: edita nome e endereço sem auditoria
    Dado a filial "F1" com fuso "America/Sao_Paulo"
    Quando edito { nome: "Centro Novo", endereco: "Rua B" }
    Então a filial é salva com os novos valores, com lock de UPDATE
    E registrarAlteracoes não é chamado
    E "filial.conteudo-alterado" é emitido após o commit

  Cenário: edita o fuso com auditoria (D7)
    Dado a filial "F1" com fuso "America/Sao_Paulo"
    Quando edito { fusoHorario: "America/Manaus" }
    Então registrarAlteracoes recebe antes { fusoHorario: "America/Sao_Paulo" } e depois { fusoHorario: "America/Manaus" }

  Cenário: edita com fuso inválido
    Quando edito { fusoHorario: "xyz" }
    Então recebo FUSO_HORARIO_INVALIDO
    E nenhuma transação é aberta

  Cenário: edita filial inexistente
    Dado findOne retornando null
    Quando edito "F9"
    Então recebo RECURSO_NAO_ENCONTRADO
    E save não é chamado

  # ---------- excluir ----------
  Cenário: exclui em cascata na ordem dos handlers (RN12, RN25)
    Dado a filial "F1" do tenant "T1"
    E handlers produtos(10), categorias(20), panfletos(30)
    Quando excluo "F1"
    Então os handlers são chamados em sequência: produtos, categorias, panfletos
    E cada um recebe ("T1", "F1", { transaction }) com a mesma transação
    E filial.destroy é chamado depois de todos os handlers, com a transação
    E após o commit é emitido "filial.conteudo-alterado" com { tenantId: "T1", filialId: "F1" }

  Cenário: exclui sem handlers registrados (fase 2 isolada)
    Dado nenhum handler registrado
    Quando excluo "F1"
    Então filial.destroy é chamado

  Cenário: falha em um handler desfaz tudo
    Dado o handler categorias lançando erro
    Quando excluo "F1"
    Então o erro é propagado
    E panfletos não é chamado
    E filial.destroy não é chamado
    E "filial.conteudo-alterado" não é emitido

  Cenário: excluir filial inexistente ou de outro tenant
    Dado findOne retornando null
    Quando excluo "F9"
    Então recebo RECURSO_NAO_ENCONTRADO
    E nenhum handler é chamado

  Cenário: exclusão toma lock da filial
    Quando excluo "F1"
    Então findOne é chamado com lock UPDATE dentro da transação
```

### 12.12 `QrCodeService` (`filiais/__tests__/qrcode.service.spec.ts`)

```gherkin
Funcionalidade: QR Code da filial (RN11, RN39)

  Contexto:
    Dado PUBLIC_BASE_URL "https://tabloide.app"

  Cenário: URL pública
    Quando monto a URL do código "k7Qm2xPa"
    Então recebo "https://tabloide.app/f/k7Qm2xPa"

  Cenário: SVG
    Quando gero o QR de "k7Qm2xPa" em svg
    Então contentType é "image/svg+xml"
    E o conteúdo começa com "<svg"
    E ao decodificar (jsQR em teste) obtenho "https://tabloide.app/f/k7Qm2xPa"

  Cenário: PNG com tamanho
    Quando gero em png com tamanho 1024
    Então contentType é "image/png"
    E o buffer começa com a assinatura PNG (89 50 4E 47)
    E a largura da imagem é 1024

  Cenário: ETag determinístico
    Quando calculo o etag duas vezes com os mesmos parâmetros
    Então os valores são iguais

  Cenário: ETag muda com formato, tamanho ou URL base
    Então os etags de (svg,512), (png,512), (png,1024) e (svg,512 com outra base) são todos diferentes

  Cenário: nível de correção e margem
    Quando gero o QR
    Então a lib é chamada com errorCorrectionLevel "M" e margin 2
```

### 12.13 `FiliaisController` (`filiais/__tests__/filiais.controller.spec.ts`)

Testa só o mapeamento DTO → service → view, com o service mockado. A aplicação de teste usa o `ValidationPipe` global e o `AppExceptionFilter`.

```gherkin
Funcionalidade: Rotas de filiais

  Cenário: POST cria e devolve 201 com Location
    Quando POST /v1/painel/filiais com { nome: "  Centro  ", endereco: "Rua A" }
    Então o service recebe ("T1", { nome: "Centro", endereco: "Rua A" })
    E a resposta é 201 com header Location "/v1/painel/filiais/<id>"
    E o corpo tem urlPublica e não tem tenantId nem deletedAt

  Cenário: POST sem nome
    Quando POST com { endereco: "Rua A" }
    Então 400 VALIDACAO_INVALIDA com detalhe em "nome"

  Cenário: POST com nome só de espaços
    Quando POST com { nome: "   ", endereco: "Rua A" }
    Então 400 VALIDACAO_INVALIDA

  Cenário: POST com nome de 121 caracteres
    Então 400 VALIDACAO_INVALIDA

  Cenário: POST com codigoPublico ou tenantId no corpo
    Então 400 VALIDACAO_INVALIDA e o service não é chamado

  Cenário: PATCH com corpo vazio
    Quando PATCH /v1/painel/filiais/<id> com {}
    Então 400 VALIDACAO_INVALIDA "informe ao menos um campo"

  Cenário: PATCH com codigoPublico
    Então 400 VALIDACAO_INVALIDA (código imutável, RN39)

  Cenário: id que não é UUID
    Quando GET /v1/painel/filiais/abc
    Então 404 RECURSO_NAO_ENCONTRADO e o service não é chamado

  Cenário: DELETE devolve 204
    Quando DELETE /v1/painel/filiais/<id>
    Então o service.excluir recebe ("T1", id)
    E a resposta é 204 sem corpo

  Cenário: GET lista com paginação padrão
    Quando GET /v1/painel/filiais
    Então o service recebe ("T1", { pagina: 1, porPagina: 50 })
    E a resposta é { itens, total, pagina: 1, porPagina: 50 }

  Cenário: QR Code com ETag igual devolve 304 sem gerar
    Dado que o etag calculado é W/"abc"
    Quando GET .../qrcode com If-None-Match W/"abc"
    Então a resposta é 304
    E QrCodeService.gerar não é chamado

  Cenário: QR Code PNG para download
    Quando GET .../qrcode?formato=png&download=1
    Então Content-Type é image/png
    E Content-Disposition é attachment; filename="qrcode-<codigo>.png"
    E Cache-Control é "private, max-age=86400"

  Cenário: QR Code de filial de outro tenant
    Dado service.obter lançando RECURSO_NAO_ENCONTRADO
    Quando GET .../qrcode
    Então 404 e etag/gerar não são chamados

  Cenário: QR Code com formato inválido
    Quando formato=jpg
    Então 400 VALIDACAO_INVALIDA

  Cenário: QR Code com tamanho fora do intervalo
    Quando tamanho=4096
    Então 400 VALIDACAO_INVALIDA
```

### 12.14 `VigenciaService` (`vigencia/__tests__/vigencia.service.spec.ts`)

```gherkin
Funcionalidade: Hoje da filial

  Cenário: usa o fuso da filial
    Dado o relógio em "2026-10-19T03:30:00Z"
    Quando peço hojeDaFilial({ fusoHorario: "America/Manaus" })
    Então recebo "2026-10-18"
    E para "America/Sao_Paulo" recebo "2026-10-19"

  Cenário: situacaoDe combina relógio, fuso e calcularSituacao
    Dado o relógio em "2026-10-18T12:00:00Z" e um item com limite "2026-10-17"
    Quando peço situacaoDe(item, filial de São Paulo)
    Então recebo "VENCIDO"
```

### 12.15 Exemplo de implementação Jest

```ts
// src/modules/filiais/__tests__/filiais.service.spec.ts (trecho)
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize, UniqueConstraintError } from 'sequelize';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FiliaisService } from '../services/filiais.service';
import { Filial } from '../models/filial.model';
import { GERADOR_CODIGO_PUBLICO } from '../services/gerador-codigo-publico';
import { ExclusaoEmCascataFilialRegistry } from '../cascata/exclusao-em-cascata-filial.registry';
import { VERIFICADOR_LIMITES } from '../../../common/limites/verificador-limites';
import { AuditoriaService } from '../../auditoria/services/auditoria.service';
import { AppConfig } from '../../../config/app.config';
import { transacaoFake } from '../../../../test/helpers/transacao-fake';

const erroUnico = (constraint: string) =>
  new UniqueConstraintError({ errors: [], fields: {}, parent: Object.assign(new Error(), { constraint }) as any });

describe('Funcionalidade: Gestão de filiais', () => {
  let service: FiliaisService;
  const filialModel = { create: jest.fn(), findOne: jest.fn(), findAndCountAll: jest.fn() };
  const gerador = { gerar: jest.fn() };
  const auditoria = { registrarCriacao: jest.fn(), registrarAlteracoes: jest.fn() };
  const eventos = { emit: jest.fn() };
  const limites = { verificarCriacaoFilial: jest.fn() };
  const registry = new ExclusaoEmCascataFilialRegistry();
  let t: ReturnType<typeof transacaoFake>;
  const sequelize = { transaction: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    t = transacaoFake();                       // { LOCK, afterCommit(cb), commit() → roda callbacks }
    sequelize.transaction.mockImplementation(async (optsOuCb: any, cb?: any) => {
      const fn = cb ?? optsOuCb;               // aninhada (savepoint) ou externa
      const r = await fn(t);
      if (!cb) await t.commit();
      return r;
    });
    filialModel.create.mockImplementation(async (v) => ({ ...v }));

    const mod = await Test.createTestingModule({
      providers: [
        FiliaisService,
        { provide: getModelToken(Filial), useValue: filialModel },
        { provide: Sequelize, useValue: sequelize },
        { provide: GERADOR_CODIGO_PUBLICO, useValue: gerador },
        { provide: ExclusaoEmCascataFilialRegistry, useValue: registry },
        { provide: VERIFICADOR_LIMITES, useValue: limites },
        { provide: AuditoriaService, useValue: auditoria },
        { provide: EventEmitter2, useValue: eventos },
        { provide: AppConfig, useValue: { fusoHorarioPadrao: 'America/Sao_Paulo' } },
      ],
    }).compile();
    service = mod.get(FiliaisService);
  });

  describe('Cenário: colisão de código público é retentada (RN39)', () => {
    describe('Dado o gerador devolvendo "AAAAAAAA" e depois "BBBBBBBB"', () => {
      describe('E create falhando com unicidade do código na primeira vez', () => {
        describe('Quando crio a filial', () => {
          let filial: any;
          beforeEach(async () => {
            gerador.gerar.mockReturnValueOnce('AAAAAAAA').mockReturnValueOnce('BBBBBBBB');
            filialModel.create
              .mockRejectedValueOnce(erroUnico('filiais_codigo_publico_uk'))
              .mockImplementationOnce(async (v) => ({ ...v }));
            filial = await service.criar('T1', { nome: 'Centro', endereco: 'Rua A, 100' });
          });

          it('Então create é chamado 2 vezes', () => {
            expect(filialModel.create).toHaveBeenCalledTimes(2);
          });
          it('E a filial é criada com "BBBBBBBB"', () => {
            expect(filial.codigoPublico).toBe('BBBBBBBB');
          });
          it('E o evento filial.conteudo-alterado é emitido após o commit', () => {
            expect(eventos.emit).toHaveBeenCalledWith('filial.conteudo-alterado',
              { tenantId: 'T1', filialId: filial.id });
          });
        });
      });
    });
  });

  describe('Cenário: fuso inválido', () => {
    describe('Quando crio com fusoHorario "Marte/Olympus"', () => {
      it('Então recebo FUSO_HORARIO_INVALIDO e nenhuma transação é aberta', async () => {
        await expect(service.criar('T1', { nome: 'C', endereco: 'R', fusoHorario: 'Marte/Olympus' }))
          .rejects.toMatchObject({ codigo: 'FUSO_HORARIO_INVALIDO', detalhes: { campo: 'fusoHorario' } });
        expect(sequelize.transaction).not.toHaveBeenCalled();
      });
    });
  });
});
```

```ts
// src/modules/vigencia/__tests__/situacao.spec.ts (trecho com tabela)
describe('Funcionalidade: Situação de item com vigência (RN23, RN24, RN25)', () => {
  describe.each`
    inicio          | limite          | situacao
    ${'2026-10-19'} | ${null}         | ${'AGENDADO'}
    ${'2026-10-18'} | ${'2026-10-18'} | ${'VIGENTE'}
    ${'2026-10-01'} | ${'2026-10-17'} | ${'VENCIDO'}
  `('Cenário: item de $inicio a $limite', ({ inicio, limite, situacao }) => {
    describe('Quando calculo a situação para hoje "2026-10-18"', () => {
      it(`Então a situação é "${situacao}"`, () => {
        expect(calcularSituacao({ dataInicio: inicio, dataLimite: limite, deletedAt: null }, '2026-10-18'))
          .toBe(situacao);
      });
    });
  });
});
```

## 13. Testes de integração (`test/integration`, Testcontainers Postgres 16)

### 13.1 `filiais.int-spec.ts`

```gherkin
Funcionalidade: Filiais no banco real

  Cenário: migrations sobem e descem
    Quando aplico todas as migrations e depois desfaço todas
    Então não há erro

  Cenário: código público único entre filiais excluídas (D1)
    Dado uma filial excluída com código "k7Qm2xPa"
    Quando insiro outra filial com o mesmo código
    Então o banco recusa com violação de "filiais_codigo_publico_uk"

  Cenário: formato do código no banco
    Quando insiro uma filial com código "0OIl1abc"
    Então o banco recusa com "filiais_codigo_publico_formato_ck"

  Cenário: nome vazio no banco
    Quando insiro uma filial com nome "   "
    Então o banco recusa com "filiais_nome_nao_vazio_ck"

  Cenário: fuso padrão no banco
    Quando insiro uma filial sem fuso via SQL
    Então fuso_horario é "America/Sao_Paulo"

  Cenário: ordenação pt-BR (D11)
    Dado filiais "Zona Sul", "Água Fria", "avenida", "Centro"
    Quando listo via HTTP
    Então a ordem é "Água Fria", "avenida", "Centro", "Zona Sul"

  Cenário: fluxo HTTP completo
    Dado um lojista autenticado
    Quando crio, listo, detalho, edito o fuso e excluo uma filial
    Então cada passo devolve o status esperado (201, 200, 200, 200, 204)
    E depois da exclusão GET devolve 404
    E a linha continua no banco com deleted_at preenchido (RN25)
    E a auditoria tem 2 linhas de FILIAL/fusoHorario (criação e edição)

  Cenário: cascata usa a mesma transação e faz rollback
    Dado um handler de teste registrado que exclui linhas de uma tabela temporária "itens_teste"
    E um segundo handler que lança erro
    Quando excluo a filial
    Então a resposta é 500
    E nem a filial nem os itens_teste foram excluídos

  Cenário: cascata bem-sucedida
    Dado um handler de teste que marca itens_teste da filial como excluídos
    Quando excluo a filial
    Então os itens_teste da filial estão excluídos
    E os itens_teste de outra filial do mesmo tenant não foram tocados

  Cenário: lojista desativado não escreve
    Dado o lojista com status DESATIVADO
    Quando POST, PATCH e DELETE em filiais
    Então todos devolvem 403 LOJISTA_DESATIVADO
    E GET lista e GET qrcode devolvem 200

  Cenário: lojista aguardando ativação escreve normalmente
    Dado o lojista com status AGUARDANDO_ATIVACAO
    Quando crio uma filial
    Então recebo 201

  Cenário: QR Code decodificável
    Quando GET .../qrcode?formato=png
    Então a imagem decodificada contém "<PUBLIC_BASE_URL>/f/<codigoPublico>"

  Cenário: trava de tenant no ORM
    Quando chamo Filial.findAll() sem tenantId fora do módulo público
    Então é lançado TenantScopeViolationError
```

### 13.2 Vazamento entre tenants (RNF04): `filiais.vazamento.int-spec.ts`

```gherkin
Funcionalidade: Isolamento de filiais entre lojistas

  Contexto:
    Dado os lojistas A e B ativos
    E a filial FB do lojista B
    E estou autenticado como A

  Esquema do Cenário: acesso a filial de outro lojista
    Quando <metodo> <rota> com o id de FB
    Então a resposta é 404 RECURSO_NAO_ENCONTRADO
    E a filial FB continua inalterada no banco
    Exemplos:
      | metodo | rota                              |
      | GET    | /v1/painel/filiais/:id            |
      | PATCH  | /v1/painel/filiais/:id            |
      | DELETE | /v1/painel/filiais/:id            |
      | GET    | /v1/painel/filiais/:id/qrcode     |

  Cenário: listagem não mostra filiais de outro lojista
    Quando GET /v1/painel/filiais
    Então nenhum item tem o id de FB
    E total conta só as filiais de A

  Cenário: tenantId no corpo é ignorado/recusado
    Quando POST /v1/painel/filiais com tenantId de B
    Então 400 VALIDACAO_INVALIDA
    E nenhuma filial é criada para B

  Cenário: resposta de 404 é idêntica para inexistente e alheio
    Quando GET de FB e GET de um UUID v7 aleatório
    Então status e corpo são iguais
```

### 13.3 `auditoria.int-spec.ts`

```gherkin
Funcionalidade: Auditoria no banco real

  Cenário: auditoria é append-only (D8)
    Dado uma linha de auditoria
    Quando executo UPDATE nela
    Então o banco recusa
    E quando executo DELETE nela
    Então o banco recusa

  Cenário: auditoria participa da transação
    Dado uma edição de fuso que falha depois do registro da auditoria (rollback forçado)
    Então nenhuma linha de auditoria é gravada

  Cenário: request_id é gravado
    Quando edito o fuso enviando o header X-Request-Id "abc-123"
    Então a linha de auditoria tem request_id "abc-123"

  Cenário: isolamento da consulta de auditoria (RNF04)
    Dado lojistas A e B, cada um com uma filial com fuso editado
    E estou autenticado como A
    Quando GET /v1/painel/auditoria?entidade=FILIAL&entidadeId=<filial de B>
    Então recebo 200 com itens vazios e total 0

  Cenário: entidade inválida no banco
    Quando insiro uma linha com entidade "CATEGORIA"
    Então o banco recusa com "auditoria_entidade_ck"
```

## 14. Coleção da fase (`api/http/fase-2.http`)

Requests de exemplo, com o JWT em variável: criar filial (fuso padrão e fuso de Manaus), listar, detalhar, editar nome, editar fuso, QR SVG, QR PNG 1024 para download, QR com `If-None-Match`, excluir, consultar auditoria da filial. Incluir um exemplo de cada erro: fuso inválido, `codigoPublico` no PATCH e id de outro tenant.

## 15. Checklist de pronto

- [x] Dependências e variáveis de ambiente (`PUBLIC_BASE_URL`, `FUSO_HORARIO_PADRAO`) validadas pelo zod.
- [x] Migrations `auditoria_alteracoes` e `filiais` sobem e descem.
- [x] Constraints: `filiais_codigo_publico_uk` (não parcial), formato, nome/endereço não vazios, entidade da auditoria; trigger append-only.
- [x] Models com `@TenantScoped()`; `Filial` com `paranoid: true`.
- [x] Funções puras de `vigencia/domain` com 100% de linhas e branches.
- [x] `VigenciaService` exportado e usado pelas próximas fases.
- [x] `AuditoriaService` com `registrarAlteracoes`/`registrarCriacao`/`listar` e `CAMPOS_AUDITADOS` exportado.
- [x] `ExclusaoEmCascataFilialRegistry` exportado e documentado para as Fases 3 e 4 (produtos 10, categorias 20, panfletos 30).
- [x] `VERIFICADOR_LIMITES` com `SemLimitesVerificador` registrado globalmente.
- [x] `ConteudoAlteradoEvento` e `EVENTO_CONTEUDO_ALTERADO` exportados de `common/eventos`; `FiliaisService` emite `filial.conteudo-alterado` só após o commit (criar, editar, excluir).
- [x] Rotas de filiais, QR Code e auditoria com status e erros conforme as seções 9.3 e 10.8.
- [x] `ParseUuidOu404Pipe` e `@IsDataISO()` disponíveis em `common/`.
- [x] Catálogo de erros atualizado com `DATA_INICIO_INVALIDA` em `00-visao-geral.md`.
- [x] Todos os cenários BDD da seção 12 implementados e passando; cobertura ≥ 90% em `services/` e `domain/`.
- [x] Integração (seção 13), incluindo vazamento entre tenants de filiais e auditoria, passando.
- [x] `fase-2.http` atualizado.

## 16. Implementação (18/10/2026)

Fase concluída. São 492 testes unitários e 71 de integração passando; os 71 incluem os 45 da Fase 1. A cobertura é de 98,4% de linhas e 95,8% de branches, e `vigencia/domain` tem 100%.

Desvios em relação a este plano, todos já refletidos no código:

| Item | Plano | Implementado | Motivo |
| --- | --- | --- | --- |
| `AppConfig` | Pressuposto da Fase 1 | Criado nesta fase (`config/app.config.ts`, global), com `publicBaseUrl`, `fusoHorarioPadrao` e `maxImagemBytes` (10 MB fixo até a Fase 3) | Não existia na Fase 1 |
| `FilialView.de(filial, qr)` | View recebe o `QrCodeService` | `filialView(filial, baseUrlPublica)`, com a função pura `urlPublicaDaFilial` em `filiais/domain` | A regra de lint do MVC proíbe view importar service |
| `nanoid` | v5 (ESM) ou v3 | v3 (CommonJS) | Funciona com o Jest sem transformação extra |
| `@NaoVazio()` | Validador próprio | `@NormalizarEspacos()` + `@Length(1, …)` | Depois de aparar os espaços, texto vazio já falha no `Length` |
| Corpo vazio no PATCH | `@ValidateIf` de classe | `@AoMenosUmCampo()` da Fase 1, com erro em `detalhes.campos.corpo` | Reaproveita o padrão já existente |
| `request_id` | `varchar(40)` | `varchar(64)` | O `x-request-id` recebido aceita até 64 caracteres (Fase 1) |
| `created_at`/`updated_at` em `filiais` | Sem default | `DEFAULT now()` | Inserts por SQL (admin e testes) não precisam informar |
| `ValidationPipe` global | No `AppModule` | `common/pipes/validation.pipe.ts` (`criarValidationPipe`) | Os testes HTTP de controller usam o mesmo pipe |
| Barrel `vigencia/domain/index.ts` | Não previsto | Não existe; imports diretos | Arquivo sem uso derrubava a meta de 100% |
| Cenário de horário de verão (12.3) | `2018-11-04T02:30Z` → dia 04 | `2019-01-15T02:30Z` → dia 15 (UTC-2), e `2018-11-04T02:30Z` → dia 03 | O horário de verão de 2018 começou às 00:00 locais de 04/11; o exemplo do plano ainda caía no dia 03 |
| Teste de PNG do QR Code | Gera e decodifica 1024 px | Confere 1024 px pelo cabeçalho IHDR e decodifica uma imagem de 256 px | Decodificar 1024 px com cobertura e workers em paralelo passava às vezes do timeout de 5 s |

Contratos entregues para as Fases 3 a 5 (nomes exatos do código):

- `ExclusaoEmCascataFilialRegistry.registrar(handler)`, em `modules/filiais/cascata/`, com a interface `ExclusaoEmCascataFilial` (`nome`, `ordem`, `excluirPorFilial(tenantId, filialId, { transaction })`).
- `FiliaisService.obter(tenantId, id, { transaction?, lock? })`; o `FiliaisModule` exporta `FiliaisService`, o registry, `AuditoriaModule` e `VigenciaModule`.
- `vigencia/domain`: `calcularSituacao`, `resolverDataInicio`, `validarDatas`, `validarCriacao`, `validarEdicaoDeDatas`, `periodosSeSobrepoem`, `INFINITO` e `normalizarFuso`; `VigenciaService.hojeDaFilial(filial)`.
- `AuditoriaService.registrarCriacao` e `registrarAlteracoes`, mais `CAMPOS_AUDITADOS` (exige a transação).
- `VERIFICADOR_LIMITES` / `VerificadorLimites`, com `SemLimitesVerificador` global.
- `EVENTO_CONTEUDO_ALTERADO` / `ConteudoAlteradoEvento` em `common/eventos`, emitido via `transaction.afterCommit`.
- `@IsDataISO({ anulavel? })`, `ParseUuidOu404Pipe` e `PaginacaoQueryDto` / `Pagina<T>` em `common/`.
- Helpers de teste: `test/helpers/transacao-fake.ts`, `test/helpers/app-de-controller.ts` e `test/factories/filial.factory.ts`.
