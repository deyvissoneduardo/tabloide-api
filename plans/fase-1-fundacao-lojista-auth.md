# Fase 1 — Fundação, lojista, autenticação e isolamento multi-tenant

Base: `00-visao-geral.md` (stack, MVC, convenções, modelo de dados, contrato de erros, estratégia de testes). Este documento detalha só o que é desta fase.

## Objetivo

Deixar o projeto de pé, com todas as fundações das fases seguintes: estrutura MVC, banco com migrations, contrato de erros, relógio injetável, utilitários de data, dinheiro e texto, contexto de tenant e trava de tenant no ORM. Sobre essa base, entregar o ciclo de vida do lojista: cadastro, login, consulta e edição dos próprios dados, controle de status e a redefinição de senha pelo administrador.

## Escopo

| Item | Regras |
| --- | --- |
| Setup do projeto (NestJS, Docker, env, Sequelize, Jest, ESLint, logs) | — |
| Contrato de erros global + tradução de erros do Postgres | Visão geral, "Contrato de erros" |
| `ClockService`, `date-only`, `money`, `text` | RN24 (base), RNF06 (base) |
| `TenantContext`, `@TenantScoped`, hooks de trava | RN07, RNF04 |
| Tabelas `lojistas` e `lojista_ativacoes` | RN02, RN03, RN04 |
| Cadastro do lojista | RN01, RN02, RN37 |
| Login com JWT + rate limit | RN05, RNF05 |
| `JwtAuthGuard` global + `@Public()` | RN05 |
| `TenantStatusGuard` | RN08, tabela de status |
| `GET/PATCH /v1/painel/lojista` (só campos textuais) | RN01 |
| `AdminKeyGuard` + `PATCH /v1/admin/lojistas/:id/senha` | RN36 |
| Integração com Testcontainers + base dos testes de vazamento | RNF04 |

## Fora de escopo (fases seguintes)

- Logo e cores da identidade visual (RN06): Fase 3, junto com o módulo de mídia. As colunas `logo_path`, `cor_primaria` e `cor_secundaria` já nascem nesta fase, mas ficam nulas e não são expostas no PATCH.
- Filiais, vigência e auditoria: Fase 2.
- Bloqueio da página pública por status (RN35): o critério fica definido aqui, mas a implementação é da Fase 5.
- `helmet`, `compression`, CORS final, health check e limites (RNF12): Fase 5.
- Troca de e-mail pelo lojista: fora do MVP. O e-mail é o login e só muda pelo administrador no banco.

## Pré-requisitos

- Node.js 22 LTS e npm 10.
- Docker Desktop (para o Postgres local e o Testcontainers).
- Documentos de regras atualizados em `docs/` (versão de 18/10/2026).

## Decisões desta fase

| Decisão | Valor | Motivo |
| --- | --- | --- |
| Expiração do JWT | `JWT_EXPIRES_IN`, padrão `8h` (um turno de trabalho) | Sem refresh token no MVP. O lojista loga de novo a cada turno |
| Algoritmo JWT | HS256 com `JWT_SECRET` de no mínimo 32 caracteres (validado pelo zod) | Um único serviço emite e valida |
| Rate limit do login | 5 tentativas por 15 min, chave `ip + email normalizado` | RNF05. Contar só por IP prejudicaria uma loja com vários usuários na mesma rede |
| Rate limit do cadastro | 10 por hora por IP | Evita cadastro em massa |
| Rate limit da rota admin | 10 por minuto por IP | Dificulta força bruta na chave |
| Armazenamento do throttler | Em memória (uma instância) | Revisar na Fase 5 se houver mais de uma instância |
| Senha | 8 a 128 caracteres, ao menos 1 letra e 1 número | Equilíbrio com RNF09 (lojista não técnico) |
| Parâmetros argon2id | `memoryCost 19456`, `timeCost 2`, `parallelism 1` | Mínimo recomendado pela OWASP, cerca de 30–50 ms por hash |
| WhatsApp | Aceita formatos brasileiros com ou sem máscara e normaliza para E.164 (`+55DDDNÚMERO`, 10 ou 11 dígitos após o 55) | Só operação no Brasil no MVP |
| CNPJ | Aceita com ou sem máscara, guarda 14 dígitos e valida os dígitos verificadores | RN01 (opcional, mas válido quando informado) |
| E-mail | `trim` + minúsculas na aplicação e `citext` no banco | RN37 (único, sem diferenciar maiúsculas de minúsculas) |
| Login de lojista desativado | Permitido | Desativado tem painel só de consulta (RN08 e tabela de status) |
| Cache de status | LRU de 30 s com no máximo 10 mil entradas, invalidado localmente quando o próprio processo altera algo do lojista | Visão geral, "Status do lojista" |
| Admin sem chave ou com chave errada | `404 RECURSO_NAO_ENCONTRADO`, mesma resposta de rota inexistente | RN36: não revelar que o endpoint existe |

## Passo a passo de implementação

As tarefas estão em ordem. Cada uma termina com seus testes verdes.

### T1. Projeto e ferramentas

Arquivos: `api/package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `.prettierrc`, `eslint.config.mjs`, `.gitignore`, `.nvmrc` (`22`), `.env.example`.

Dependências de produção: `@nestjs/{core,common,platform-express,config,jwt,sequelize,throttler}`, `sequelize`, `sequelize-typescript`, `pg`, `pg-hstore`, `nestjs-cls`, `nestjs-pino`, `pino-http`, `zod`, `class-validator`, `class-transformer`, `@node-rs/argon2`, `uuid`, `lru-cache`, `reflect-metadata`, `rxjs`.

Dependências de desenvolvimento: `@nestjs/{cli,testing}`, `typescript`, `jest`, `ts-jest`, `@types/jest`, `supertest`, `@types/supertest`, `@testcontainers/postgresql`, `sequelize-cli`, `eslint`, `typescript-eslint`, `prettier`, `pino-pretty`.

Scripts do `package.json`:

| Script | Comando |
| --- | --- |
| `start:dev` | `nest start --watch` |
| `build` | `nest build` |
| `start:prod` | `node dist/main.js` |
| `lint` | `eslint "src/**/*.ts" "test/**/*.ts"` |
| `format` | `prettier --write .` |
| `test` | `jest --selectProjects unit` |
| `test:int` | `jest --selectProjects integration --runInBand` |
| `test:cov` | `jest --selectProjects unit --coverage` |
| `db:up` | `docker compose up -d postgres` |
| `db:migrate` | `sequelize-cli db:migrate` |
| `db:migrate:undo:all` | `sequelize-cli db:migrate:undo:all` |
| `db:seed` | `sequelize-cli db:seed:all` |

No `tsconfig`: `strict: true`, `noUncheckedIndexedAccess: true`, `emitDecoratorMetadata`, `experimentalDecorators` e paths `@common/*`, `@modules/*`, `@config/*` e `@database/*`.

### T2. Docker e variáveis de ambiente

`api/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: tabloide
      POSTGRES_USER: tabloide
      POSTGRES_PASSWORD: tabloide
    ports: ["5432:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tabloide"]
      interval: 5s
      retries: 10
volumes:
  pgdata:
```

As extensões `citext` e `btree_gist` são criadas pela primeira migration, e não por script de init, para valerem também no Supabase.

`.env.example`:

```
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
DATABASE_URL=postgres://tabloide:tabloide@localhost:5432/tabloide
DB_POOL_MAX=10
DB_SSL=false
JWT_SECRET=troque-por-um-segredo-com-32-caracteres-ou-mais
JWT_EXPIRES_IN=8h
ADMIN_API_KEY=troque-por-uma-chave-longa-de-no-minimo-32-caracteres
LOGIN_RATE_LIMIT=5
LOGIN_RATE_TTL_SECONDS=900
TENANT_STATUS_CACHE_TTL_MS=30000
```

`src/config/env.schema.ts` (zod):

| Variável | Regra |
| --- | --- |
| `NODE_ENV` | `enum('development','test','production')` |
| `PORT` | número inteiro, padrão `3000` |
| `LOG_LEVEL` | `enum('fatal','error','warn','info','debug','trace')`, padrão `info` |
| `DATABASE_URL` | URL `postgres://` ou `postgresql://` |
| `DB_POOL_MAX` | inteiro de 1 a 50, padrão `10` |
| `DB_SSL` | booleano (`'true'`/`'false'`), padrão `false` |
| `JWT_SECRET` | string com no mínimo 32 caracteres |
| `JWT_EXPIRES_IN` | regex `^\d+[smhd]$`, padrão `8h` |
| `ADMIN_API_KEY` | string com no mínimo 32 caracteres |
| `LOGIN_RATE_LIMIT` | inteiro, padrão `5` |
| `LOGIN_RATE_TTL_SECONDS` | inteiro, padrão `900` |
| `TENANT_STATUS_CACHE_TTL_MS` | inteiro, padrão `30000` |

`validarEnv(raw): Env` lança erro com a lista de variáveis inválidas, e a aplicação não sobe. Usado em `ConfigModule.forRoot({ validate: validarEnv, isGlobal: true })`.

### T3. Bootstrap (`main.ts` e `app.module.ts`)

- `app.setGlobalPrefix('v1')`.
- `ValidationPipe` global com `{ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: false }, exceptionFactory: errosDeValidacaoParaAppError }`.
- `AppExceptionFilter` global (T5).
- `LoggerModule.forRoot` (`nestjs-pino`) com `genReqId` usando o `x-request-id` recebido ou `uuid v7`, `redact: ['req.headers.authorization', 'req.headers["x-admin-key"]', 'req.body.senha', 'req.body.novaSenha']` e `pino-pretty` só em desenvolvimento.
- `ClsModule.forRoot({ global: true, middleware: { mount: true, generateId: true, idGenerator: req => req.id } })`.
- Guards globais via `APP_GUARD`, nesta ordem: `ThrottlerGuard`, `JwtAuthGuard` e `TenantStatusGuard`.
- `app.enableShutdownHooks()`.
- `app.set('trust proxy', 1)`, para o IP real atrás do proxy do provedor (necessário ao rate limit).

### T4. Banco e Sequelize

`src/database/sequelize.config.ts` exporta um único objeto de configuração, usado pela app (`SequelizeModule.forRootAsync`) e pelo `sequelize-cli` via `.sequelizerc`:

```js
// .sequelizerc
const path = require('path');
module.exports = {
  config: path.resolve('dist/database/sequelize.config.cli.js'),
  'migrations-path': path.resolve('src/database/migrations'),
  'seeders-path': path.resolve('src/database/seeders'),
};
```

Migrations em `.js` (CommonJS), para o `sequelize-cli` rodar sem `ts-node`. Opções da conexão:

| Opção | Valor |
| --- | --- |
| `dialect` | `postgres` |
| `logging` | `false` em produção e teste; logger pino em `debug` |
| `pool` | `{ max: DB_POOL_MAX, min: 0, idle: 10000, acquire: 30000 }` |
| `define` | `{ underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' }` |
| `dialectOptions.ssl` | `{ require: true, rejectUnauthorized: false }` quando `DB_SSL=true` |
| `autoLoadModels` | `true`; `synchronize: false` sempre |

`DatabaseModule` registra os hooks de tenant (T8) após a inicialização do Sequelize (`onModuleInit`).

### T5. Contrato de erros

Arquivos em `src/common/errors/`:

- `codigos-erro.ts`: `enum CodigoErro` com todos os códigos da visão geral e um mapa `CodigoErro → status HTTP`.
- `app.error.ts`: `class AppError extends Error { constructor(codigo: CodigoErro, mensagem?: string, detalhes?: Record<string, unknown>) }`, com mensagem padrão em português por código.
- `errors.ts`: atalhos `naoEncontrado()`, `validacaoInvalida(detalhes)` etc.
- `pg-erros.ts`: `traduzirErroPg(err): AppError | null`, que usa `err.parent.code` e `err.parent.constraint`:

| `code` | Constraint | Resultado |
| --- | --- | --- |
| `23505` | `lojistas_email_key` | `EMAIL_JA_CADASTRADO` |
| `23P01` | `panfletos_periodo_sem_sobreposicao` (Fase 3) | `PANFLETO_PERIODO_SOBREPOSTO` |
| `23514` | mapa `CONSTRAINT_PARA_CODIGO` (aberto para extensão nas fases seguintes) | código mapeado ou `VALIDACAO_INVALIDA` |
| `23503` | qualquer | `RECURSO_NAO_ENCONTRADO` |
| outro | — | `null` (vira `ERRO_INTERNO`) |

- `app-exception.filter.ts`: aceita `AppError`, `HttpException` do Nest (404 de rota → `RECURSO_NAO_ENCONTRADO`, `ThrottlerException` → `MUITAS_TENTATIVAS`), erros do Sequelize (`traduzirErroPg`) e qualquer outro (`ERRO_INTERNO`, com log de nível `error` e stack, sem vazar mensagem ou stack na resposta). Sempre responde `{ erro: { codigo, mensagem, detalhes? } }` com o header `x-request-id`.
- `validacao.ts`: `errosDeValidacaoParaAppError(errors: ValidationError[])` gera `VALIDACAO_INVALIDA` com `detalhes: { campos: { [campo]: string[] } }`, achatando objetos aninhados com notação de ponto.

### T6. Relógio

`src/common/clock/clock.service.ts`:

```ts
@Injectable()
export class ClockService {
  agora(): Date { return new Date(); }
}
```

O `ClockModule` é global. O ESLint proíbe `new Date()` sem argumento e `Date.now()` em `src/modules/**/services/**` e `src/modules/**/domain/**` (`no-restricted-syntax`).

### T7. Utilitários puros

`src/common/utils/date-only.ts`:

```ts
export type DataISO = string & { readonly __brand: 'DataISO' }; // 'YYYY-MM-DD'
export function ehDataISO(valor: string): valor is DataISO;      // formato + data de calendário válida
export function paraDataISO(valor: string): DataISO;             // lança AppError VALIDACAO_INVALIDA se inválida
export function hojeNoFuso(fuso: string, agora: Date): DataISO;  // Intl.DateTimeFormat('en-CA', { timeZone: fuso })
export function ehFusoValido(fuso: string): boolean;             // try { new Intl.DateTimeFormat('en-US', { timeZone }) }
export function compararDatas(a: DataISO, b: DataISO): -1 | 0 | 1;
export function formatarDiaMes(d: DataISO): string;              // 'dd/mm' (RN31, usado na Fase 5)
```

Para performance, `hojeNoFuso` guarda um `Intl.DateTimeFormat` por fuso num `Map`, já que criar o formatador é a parte cara.

`src/common/utils/money.ts`:

```ts
export function ehCentavosValido(v: unknown): v is number;   // inteiro, >= 0, <= 99_999_999
export function centavosParaReais(c: number): string;        // 1990 -> '19,90' (pt-BR, sem símbolo)
```

`src/common/utils/text.ts`:

```ts
export const collatorPtBr: Intl.Collator;                    // new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })
export function compararTextoPtBr(a: string, b: string): number;
export function normalizarEspacos(s: string): string;        // trim + colapsa espaços internos
export function normalizarEmail(s: string): string;          // trim + toLowerCase
export function somenteDigitos(s: string): string;
export function normalizarWhatsappBr(s: string): string | null; // E.164 '+55…' ou null se inválido
export function normalizarCnpj(s: string): string | null;       // 14 dígitos com DV válido ou null
```

Regras de `normalizarWhatsappBr`:

1. Extrai os dígitos. Se começar com `55` e tiver 12 ou 13 dígitos, remove o `55`.
2. O restante precisa ter 10 ou 11 dígitos, com DDD entre `11` e `99` e sem `0` inicial.
3. Com 11 dígitos, o terceiro dígito (primeiro após o DDD) precisa ser `9` (celular).
4. Devolve `+55` seguido dos dígitos.

Regras de `normalizarCnpj`: extrai os dígitos, exige exatamente 14, recusa sequências repetidas (`00000000000000` etc.) e calcula os dois dígitos verificadores com pesos `5,4,3,2,9,8,7,6,5,4,3,2` e `6,5,4,3,2,9,8,7,6,5,4,3,2`.

### T8. Contexto de tenant e trava no ORM

`src/common/tenant/tenant-context.ts`:

```ts
@Injectable()
export class TenantContext {
  constructor(private readonly cls: ClsService) {}
  definir(tenantId: string): void;
  obter(): string | undefined;
  obterObrigatorio(): string; // lança AppError NAO_AUTENTICADO se ausente
}
```

`src/common/decorators/tenant-id.decorator.ts`: `@TenantId()` lê `request.user.tenantId` (preenchido pelo `JwtAuthGuard`) e lança `NAO_AUTENTICADO` se não houver.

`src/database/tenant-scoped.decorator.ts`: `@TenantScoped()` é um decorator de classe que registra o model num `Set<ModelCtor>` (`MODELOS_TENANT_SCOPED`).

`src/database/tenant-scope.hooks.ts`:

```ts
export class TenantScopeViolationError extends Error {}
export function exigeTenantNoWhere(where: unknown): boolean;         // função pura
export function registrarHooksDeTenant(sequelize: Sequelize): void;
```

Algoritmo de `exigeTenantNoWhere(where)`:

- Devolve `true` se `where` for um objeto com a chave `tenantId` (ou `tenant_id`) e valor string não vazia ou `{ [Op.eq]: string }`.
- Aceita também `where` com `[Op.and]: [...]`, desde que algum elemento satisfaça a regra.
- Devolve `false` para `where` ausente, `tenantId` `undefined` ou `null`, `tenantId` dentro de `[Op.or]` ou `{ [Op.in]: [...] }` com mais de um valor.

Hooks registrados para cada model em `MODELOS_TENANT_SCOPED`: `beforeFind`, `beforeCount`, `beforeBulkUpdate`, `beforeBulkDestroy` e `beforeBulkRestore`. Todos lançam `TenantScopeViolationError` se `options.skipTenantScope !== true` e `!exigeTenantNoWhere(options.where)`. Os hooks de instância (`beforeUpdate`, `beforeDestroy` e `beforeSave` com `isNewRecord = false`) verificam se a instância tem `tenantId` preenchido. Isso garante que ela veio de uma busca já filtrada.

`Lojista` **não** é `@TenantScoped`, porque é o próprio tenant. O acesso a `lojistas` passa sempre por `LojistasService` com `id = tenantId`. `LojistaAtivacao` também não é, porque a chave primária é o próprio `lojista_id`. Os models das fases 2 a 4 (`Filial`, `Panfleto`, `Categoria`, `Produto`, `AuditoriaAlteracao`) passam a ser.

Teste guarda-chuva: um model de teste `ModeloFicticio` marcado com `@TenantScoped` é usado nos testes unitários dos hooks, para provar a trava antes de existirem models reais de tenant.

### T9. Migrations

`20261018000001-extensoes.js`:

```sql
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

O `down` não remove as extensões, porque outras bases podem usá-las.

`20261018000002-criar-lojistas.js`:

```sql
CREATE TABLE lojistas (
  id               uuid PRIMARY KEY,
  nome_fantasia    varchar(120) NOT NULL,
  nome_responsavel varchar(120) NOT NULL,
  email            citext       NOT NULL,
  senha_hash       text         NOT NULL,
  whatsapp         varchar(20)  NOT NULL,
  cnpj             char(14)     NULL,
  logo_path        text         NULL,
  cor_primaria     char(7)      NULL,
  cor_secundaria   char(7)      NULL,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT lojistas_email_key UNIQUE (email),
  CONSTRAINT lojistas_cor_primaria_check   CHECK (cor_primaria   IS NULL OR cor_primaria   ~ '^#[0-9A-F]{6}$'),
  CONSTRAINT lojistas_cor_secundaria_check CHECK (cor_secundaria IS NULL OR cor_secundaria ~ '^#[0-9A-F]{6}$'),
  CONSTRAINT lojistas_whatsapp_check CHECK (whatsapp ~ '^\+55[1-9][0-9]{9,10}$'),
  CONSTRAINT lojistas_cnpj_check     CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$')
);
```

`20261018000003-criar-lojista-ativacoes.js`:

```sql
CREATE TYPE status_lojista AS ENUM ('AGUARDANDO_ATIVACAO', 'ATIVO', 'DESATIVADO');

CREATE TABLE lojista_ativacoes (
  lojista_id      uuid PRIMARY KEY REFERENCES lojistas(id) ON DELETE RESTRICT,
  status          status_lojista NOT NULL DEFAULT 'AGUARDANDO_ATIVACAO',
  funcionalidades jsonb          NOT NULL DEFAULT '{}'::jsonb,
  observacao      text           NULL,
  atualizado_em   timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX lojista_ativacoes_status_idx ON lojista_ativacoes (status);

-- atualizado_em automático, porque o admin altera direto no banco (RN03)
CREATE FUNCTION tocar_atualizado_em() RETURNS trigger AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER lojista_ativacoes_tocar
BEFORE UPDATE ON lojista_ativacoes
FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em();
```

O `down` faz `DROP TRIGGER`, `DROP FUNCTION`, `DROP TABLE` e `DROP TYPE`, nessa ordem.

Junto com a migration vai o arquivo `src/database/admin-ativacao.sql`, só com os comandos de referência do administrador. A app não executa nada dele:

```sql
UPDATE lojista_ativacoes SET status = 'ATIVO',       observacao = '...' WHERE lojista_id = '<uuid>';
UPDATE lojista_ativacoes SET status = 'DESATIVADO',  observacao = '...' WHERE lojista_id = '<uuid>';
```

### T10. Models

`src/modules/lojistas/models/lojista.model.ts`:

```ts
@Table({ tableName: 'lojistas', underscored: true })
export class Lojista extends Model {
  @PrimaryKey @Column(DataType.UUID) declare id: string;
  @Column(DataType.STRING(120)) declare nomeFantasia: string;
  @Column(DataType.STRING(120)) declare nomeResponsavel: string;
  @Column(DataType.CITEXT) declare email: string;
  @Column(DataType.TEXT) declare senhaHash: string;
  @Column(DataType.STRING(20)) declare whatsapp: string;
  @Column(DataType.CHAR(14)) declare cnpj: string | null;
  @Column(DataType.TEXT) declare logoPath: string | null;
  @Column(DataType.CHAR(7)) declare corPrimaria: string | null;
  @Column(DataType.CHAR(7)) declare corSecundaria: string | null;
  @HasOne(() => LojistaAtivacao) declare ativacao?: LojistaAtivacao;
}
```

Escopo padrão `defaultScope: { attributes: { exclude: ['senhaHash'] } }` e escopo nomeado `comSenha` para o login. Assim o hash nunca vaza por acidente.

`src/modules/lojistas/models/lojista-ativacao.model.ts`:

```ts
export enum StatusLojista { AGUARDANDO_ATIVACAO = 'AGUARDANDO_ATIVACAO', ATIVO = 'ATIVO', DESATIVADO = 'DESATIVADO' }

@Table({ tableName: 'lojista_ativacoes', timestamps: false })
export class LojistaAtivacao extends Model {
  @PrimaryKey @ForeignKey(() => Lojista) @Column(DataType.UUID) declare lojistaId: string;
  @Column(DataType.ENUM(...Object.values(StatusLojista))) declare status: StatusLojista;
  @Column(DataType.JSONB) declare funcionalidades: Record<string, boolean>;
  @Column(DataType.TEXT) declare observacao: string | null;
  @Column(DataType.DATE) declare atualizadoEm: Date;
}
```

### T11. Módulo `lojistas`: cadastro, consulta e edição

Pastas: `controllers/`, `services/`, `models/`, `views/`, `dtos/`, `domain/`, `__tests__/`.

#### DTOs

`dtos/cadastrar-lojista.dto.ts`:

| Campo | Tipo | Obrigatório | Validações | Transformação |
| --- | --- | --- | --- | --- |
| `nomeFantasia` | string | sim | `IsString`, comprimento 2–120 após normalizar | `normalizarEspacos` |
| `nomeResponsavel` | string | sim | `IsString`, comprimento 2–120 | `normalizarEspacos` |
| `email` | string | sim | `IsEmail({ allow_utf8_local_part: false })`, máx. 254 | `normalizarEmail` |
| `senha` | string | sim | 8–128 caracteres, regex `(?=.*[A-Za-z])(?=.*\d)` | nenhuma (nunca aparar senha) |
| `whatsapp` | string | sim | validador customizado `@IsWhatsappBr()` | `normalizarWhatsappBr` |
| `cnpj` | string \| null | não | validador customizado `@IsCnpj()` quando presente; string vazia vira `null` | `normalizarCnpj` |

Mensagens de validação em português (ex.: `"Informe um WhatsApp válido com DDD."`).

`dtos/editar-lojista.dto.ts`: `nomeFantasia`, `nomeResponsavel`, `whatsapp` e `cnpj`, todos opcionais e com as mesmas regras. `cnpj: null` remove o CNPJ. Os campos `email`, `senha`, `status` e qualquer campo de identidade visual são recusados pelo `forbidNonWhitelisted` (`VALIDACAO_INVALIDA`). Um corpo vazio `{}` gera `VALIDACAO_INVALIDA` com a mensagem `"Informe ao menos um campo."` (validador de classe `@AoMenosUmCampo()`).

#### Service

`services/senha.service.ts` (isolado, para mockar nos testes):

```ts
@Injectable()
export class SenhaService {
  gerarHash(senha: string): Promise<string>;              // argon2id com os parâmetros da fase
  verificar(hash: string, senha: string): Promise<boolean>; // false em hash malformado, sem lançar
}
```

`services/lojistas.service.ts`:

```ts
@Injectable()
export class LojistasService {
  constructor(
    @InjectModel(Lojista) private readonly lojistaModel: typeof Lojista,
    @InjectModel(LojistaAtivacao) private readonly ativacaoModel: typeof LojistaAtivacao,
    private readonly sequelize: Sequelize,
    private readonly senhaService: SenhaService,
    private readonly statusCache: StatusLojistaCache,
  ) {}

  cadastrar(dto: CadastrarLojistaDto): Promise<{ lojista: Lojista; status: StatusLojista }>;
  obterPorTenant(tenantId: string): Promise<{ lojista: Lojista; status: StatusLojista }>;
  editar(tenantId: string, dto: EditarLojistaDto): Promise<{ lojista: Lojista; status: StatusLojista }>;
  buscarParaLogin(email: string): Promise<{ lojista: Lojista; status: StatusLojista } | null>; // escopo comSenha
  obterStatus(tenantId: string): Promise<StatusLojista | null>;                                  // usado pelo cache
  redefinirSenha(lojistaId: string, novaSenha: string): Promise<void>;                           // admin
}
```

Algoritmo de `cadastrar`:

1. `email` já vem normalizado do DTO.
2. Verifica se o e-mail existe (`findOne({ where: { email }, attributes: ['id'] })`). Se existir, lança `EMAIL_JA_CADASTRADO`. É a mensagem amigável; o `UNIQUE` do banco resolve a corrida.
3. Gera o hash da senha **fora** da transação, para não segurar conexão durante o argon2.
4. Abre a transação e cria `lojistas` (`id = v7()`) e `lojista_ativacoes` (`status AGUARDANDO_ATIVACAO`), com RN02 garantido pelo código e pelo `DEFAULT` do banco.
5. Se o banco devolver violação de unicidade (corrida), o filtro converte para `EMAIL_JA_CADASTRADO`. O service não precisa tratar.
6. Devolve o lojista (sem `senhaHash`) e o status.

Algoritmo de `editar`:

1. `findOne({ where: { id: tenantId }, include: [ativacao] })`; se não achar, `RECURSO_NAO_ENCONTRADO`.
2. Aplica só os campos presentes no DTO (`undefined` = não mexe; `cnpj: null` = remove).
3. `save()` só se algo mudou (`lojista.changed()`), para evitar `UPDATE` vazio.
4. Devolve o model atualizado e o status.

O bloqueio de escrita para desativado **não** fica aqui, e sim no `TenantStatusGuard`. Assim existe um ponto único de regra.

Algoritmo de `redefinirSenha`:

1. Valida o `lojistaId` como UUID (o DTO de parâmetro já faz isso).
2. Gera o hash.
3. `update({ senhaHash }, { where: { id: lojistaId } })`. Se 0 linhas forem afetadas, `RECURSO_NAO_ENCONTRADO`.
4. Registra log `info` `{ evento: 'admin.senha_redefinida', lojistaId }`, sem senha.

`services/status-lojista.cache.ts`:

```ts
@Injectable()
export class StatusLojistaCache {
  constructor(private readonly config: ConfigService, private readonly carregar: (tenantId: string) => Promise<StatusLojista | null>) {}
  obter(tenantId: string): Promise<StatusLojista | null>; // LRUCache com ttl = TENANT_STATUS_CACHE_TTL_MS, max 10_000, fetchMethod
  invalidar(tenantId: string): void;
}
```

O `LRUCache` usa `fetchMethod`: requisições simultâneas para o mesmo tenant fazem uma única consulta (coalescência). Um `null`, quando o lojista não existe, não é cacheado.

#### Views

`views/lojista.view.ts`:

```ts
export function lojistaView(lojista: Lojista, status: StatusLojista) {
  return {
    id: lojista.id,
    nomeFantasia: lojista.nomeFantasia,
    nomeResponsavel: lojista.nomeResponsavel,
    email: lojista.email,
    whatsapp: lojista.whatsapp,
    cnpj: lojista.cnpj,
    status,
    criadoEm: lojista.createdAt.toISOString(),
  };
}
```

Nunca inclui `senhaHash`, `logoPath` nem cores. Logo e cores entram na Fase 3.

#### Controllers

`controllers/painel-lojista.controller.ts` (`@Controller('painel/lojista')`):

**GET `/v1/painel/lojista`**: JWT. Resposta `200`:

```json
{
  "id": "0192f7a0-7c1e-7b3a-9d2f-1a2b3c4d5e6f",
  "nomeFantasia": "Mercado Bom Preço",
  "nomeResponsavel": "Ana Souza",
  "email": "ana@bompreco.com.br",
  "whatsapp": "+5511987654321",
  "cnpj": null,
  "status": "AGUARDANDO_ATIVACAO",
  "criadoEm": "2026-10-18T15:00:00.000Z"
}
```

Erros: `401 NAO_AUTENTICADO`; `404 RECURSO_NAO_ENCONTRADO` (token de lojista que não existe mais).

**PATCH `/v1/painel/lojista`**: JWT. Corpo `EditarLojistaDto`:

```json
{ "nomeFantasia": "Mercado Bom Preço Centro", "cnpj": "11.222.333/0001-81" }
```

Resposta `200` com a mesma view do GET. Erros: `400 VALIDACAO_INVALIDA`, `401 NAO_AUTENTICADO`, `403 LOJISTA_DESATIVADO`.

### T12. Módulo `auth`: cadastro e login

`controllers/auth.controller.ts` (`@Controller('auth')`, rotas `@Public()`):

**POST `/v1/auth/cadastro`**: throttle 10/hora por IP. Corpo:

```json
{
  "nomeFantasia": "Mercado Bom Preço",
  "nomeResponsavel": "Ana Souza",
  "email": "Ana@BomPreco.com.br ",
  "senha": "senhaForte1",
  "whatsapp": "(11) 98765-4321",
  "cnpj": ""
}
```

Resposta `201`: `{ "lojista": <lojistaView>, "token": "<jwt>", "expiraEm": "2026-10-18T23:00:00.000Z" }`. O lojista já sai logado, mesmo aguardando ativação (tabela de status: acesso completo). Erros: `400 VALIDACAO_INVALIDA`, `409 EMAIL_JA_CADASTRADO`, `429 MUITAS_TENTATIVAS`.

**POST `/v1/auth/login`**: throttle `LOGIN_RATE_LIMIT`/`LOGIN_RATE_TTL_SECONDS` com a chave `ip + email`. Corpo `{ "email": "ana@bompreco.com.br", "senha": "senhaForte1" }`. DTO: `email` com `IsEmail` e normalizado; `senha` com `IsString`, 1–128 caracteres (sem regra de força no login). Resposta `200`: `{ "lojista": <lojistaView>, "token": "<jwt>", "expiraEm": "…" }`. Erros: `400 VALIDACAO_INVALIDA`, `401 CREDENCIAIS_INVALIDAS`, `429 MUITAS_TENTATIVAS`.

`services/auth.service.ts`:

```ts
@Injectable()
export class AuthService {
  constructor(
    private readonly lojistas: LojistasService,
    private readonly senhaService: SenhaService,
    private readonly jwt: JwtService,
    private readonly clock: ClockService,
    private readonly config: ConfigService,
  ) {}
  cadastrar(dto: CadastrarLojistaDto): Promise<SessaoView>;
  login(dto: LoginDto): Promise<SessaoView>;
  emitirToken(tenantId: string): { token: string; expiraEm: Date };
}
```

Algoritmo de `login`:

1. `buscarParaLogin(email)`.
2. Se não existir, roda `senhaService.verificar(HASH_FICTICIO, senha)` mesmo assim, para igualar o tempo de resposta e não revelar se o e-mail existe, e lança `CREDENCIAIS_INVALIDAS`.
3. Se a senha não conferir, lança `CREDENCIAIS_INVALIDAS`.
4. Status não bloqueia o login.
5. Emite o token com o payload `{ sub: tenantId, typ: 'lojista' }` e `expiresIn = JWT_EXPIRES_IN`; `expiraEm = clock.agora() + duração`.

`HASH_FICTICIO` é gerado uma vez no `onModuleInit` (hash de uma string aleatória).

`ThrottlerGuard` customizado (`LoginThrottlerGuard`), que estende o `ThrottlerGuard` e sobrescreve `getTracker(req)` para `${req.ip}:${normalizarEmail(req.body?.email ?? '')}`. A exceção vira `429 MUITAS_TENTATIVAS` com o header `Retry-After`.

### T13. Guards

`src/common/guards/jwt-auth.guard.ts`:

- Global. Se o handler ou a classe tiverem `@Public()` (metadata `IS_PUBLIC`), libera.
- Lê `Authorization: Bearer <token>`. Se o header faltar, estiver malformado, tiver assinatura inválida, estiver expirado ou tiver `typ !== 'lojista'`, lança `NAO_AUTENTICADO`.
- Preenche `req.user = { tenantId: payload.sub }` e `tenantContext.definir(payload.sub)`.
- Rotas `/v1/admin/*` e `/v1/publico/*` são marcadas como `@Public()` na classe do controller. O admin tem guard próprio.

`src/common/guards/tenant-status.guard.ts`:

- Global, roda depois do JWT. Se for rota `@Public()`, libera.
- `status = await statusCache.obter(tenantId)`.
- `null` (lojista removido): `NAO_AUTENTICADO`.
- `DESATIVADO` e método diferente de `GET`, `HEAD` e `OPTIONS`: `LOJISTA_DESATIVADO`, exceto handler com `@SomenteLeituraPermitida()`. Esse decorator existe para rotas `POST` que só leem (nenhuma na Fase 1; deixado para extensibilidade).
- `AGUARDANDO_ATIVACAO` e `ATIVO`: libera.
- Põe o status em `req.statusLojista`, para os controllers não precisarem consultar de novo.

`src/common/guards/admin-key.guard.ts`:

- Lê `X-Admin-Key`. Se faltar, lança `RECURSO_NAO_ENCONTRADO`.
- Compara com `ADMIN_API_KEY` usando `crypto.timingSafeEqual` sobre `sha256` dos dois valores. Os hashes têm tamanho fixo, o que evita vazar o comprimento da chave e o erro de buffers de tamanhos diferentes.
- Se não bater, lança `RECURSO_NAO_ENCONTRADO` e registra log `warn` `{ evento: 'admin.chave_invalida', ip }`, sem logar o valor recebido.

### T14. Módulo `admin`

`controllers/admin-lojistas.controller.ts` (`@Controller('admin/lojistas')`, `@Public()`, `@UseGuards(AdminKeyGuard)`, `@Throttle({ default: { limit: 10, ttl: 60_000 } })`):

**PATCH `/v1/admin/lojistas/:id/senha`**

- Header `X-Admin-Key: <chave>`.
- Parâmetro `id`: `ParseUUIDPipe({ version: '7', exceptionFactory: () => naoEncontrado() })`. Id inválido vira 404, não 400, para não revelar a rota.
- Corpo `RedefinirSenhaDto`: `{ "novaSenha": "novaSenha123" }`, com as mesmas regras da senha do cadastro.
- Resposta `204` sem corpo.
- Erros: `404 RECURSO_NAO_ENCONTRADO` (sem chave, chave errada, id inválido ou lojista inexistente), `400 VALIDACAO_INVALIDA` (senha fraca, só depois de a chave ser validada), `429 MUITAS_TENTATIVAS`.

A ordem importa: o `AdminKeyGuard` roda antes do `ValidationPipe`. Por isso, uma requisição sem chave e com corpo inválido recebe 404, nunca 400.

Esta fase **não** invalida tokens já emitidos ao redefinir a senha, porque o JWT é stateless e expira em 8 h. Isso fica registrado como risco aceito no MVP.

### T15. Integração (Testcontainers)

`test/helpers/banco-de-teste.ts`:

- `iniciarBanco()`: sobe `PostgreSqlContainer('postgres:16-alpine')` uma vez por arquivo (`beforeAll`) e roda as migrations reais via `Umzug` apontando para `src/database/migrations`.
- `limparBanco()`: `TRUNCATE lojistas, lojista_ativacoes RESTART IDENTITY CASCADE` entre testes. A lista cresce nas fases seguintes.
- `criarApp()`: monta o `AppModule` com `ClockService` sobrescrito por um relógio fixo e devolve `INestApplication` + `supertest`.

`test/factories/lojista.factory.ts`: `umLojista().comEmail(...).comStatus(StatusLojista.ATIVO).criar(app)` cadastra pela rota e ajusta o status via SQL direto, igual ao administrador.

`test/helpers/vazamento.ts`: utilitário reaproveitado nas fases 2 a 4:

```ts
export function descreverVazamentoEntreTenants(recurso: {
  nome: string;
  criarComo: (token: string) => Promise<{ id: string }>;
  rotas: Array<{ metodo: 'get' | 'patch' | 'delete' | 'put' | 'post'; caminho: (id: string) => string; corpo?: object }>;
}): void;
// gera os cenários: lojista B tenta cada rota sobre o recurso de A → 404 RECURSO_NAO_ENCONTRADO, e o recurso de A continua intacto
```

## Performance e manutenibilidade nesta fase

- O argon2 roda fora de transação. Uma conexão do pool não fica presa durante o hash.
- O status do lojista vem do cache LRU com coalescência. O guard faz no máximo 1 consulta por tenant a cada 30 s, e não uma por requisição.
- `hojeNoFuso` reaproveita os formatadores `Intl` por fuso.
- `defaultScope` sem `senhaHash` reduz bytes trafegados e elimina o risco de vazar o hash numa view.
- Consulta de existência de e-mail com `attributes: ['id']`.
- Logs JSON via pino, com `redact` de credenciais.
- Regras de borda (normalização, CNPJ, WhatsApp, trava de tenant) são funções puras testadas sem mock.
- ESLint com `no-restricted-imports`:
  - `**/controllers/**` não importa `**/models/**`.
  - `**/views/**` não importa `**/services/**` nem `sequelize`.
  - `**/domain/**` não importa `@nestjs/*` nem `sequelize*`.
  - `**/services/**` não importa `**/controllers/**`.

## Testes unitários (BDD)

Cada funcionalidade abaixo vira um arquivo `*.spec.ts` em `__tests__/`, com `describe`/`it` espelhando o Gherkin, como na visão geral. Relógio fixo: `2026-10-18T12:00:00Z`.

### U1. `env.schema.ts` — `validarEnv`

```gherkin
Funcionalidade: Validação das variáveis de ambiente

  Cenário: env completo e válido
    Dado um env com todas as variáveis válidas
    Quando validarEnv é chamado
    Então devolve o objeto tipado
    E PORT é número

  Cenário: valores padrão
    Dado um env só com DATABASE_URL, JWT_SECRET e ADMIN_API_KEY
    Quando validarEnv é chamado
    Então PORT é 3000, DB_POOL_MAX é 10, JWT_EXPIRES_IN é "8h", LOGIN_RATE_LIMIT é 5 e LOGIN_RATE_TTL_SECONDS é 900

  Cenário: JWT_SECRET curto
    Dado JWT_SECRET com 31 caracteres
    Quando validarEnv é chamado
    Então lança erro citando JWT_SECRET

  Cenário: ADMIN_API_KEY ausente
    Dado um env sem ADMIN_API_KEY
    Quando validarEnv é chamado
    Então lança erro citando ADMIN_API_KEY

  Cenário: DATABASE_URL com protocolo errado
    Dado DATABASE_URL "mysql://x"
    Quando validarEnv é chamado
    Então lança erro citando DATABASE_URL

  Cenário: JWT_EXPIRES_IN em formato inválido
    Dado JWT_EXPIRES_IN "8 horas"
    Quando validarEnv é chamado
    Então lança erro citando JWT_EXPIRES_IN

  Cenário: DB_POOL_MAX fora da faixa
    Dado DB_POOL_MAX "0" e depois "51"
    Quando validarEnv é chamado
    Então lança erro citando DB_POOL_MAX nos dois casos

  Cenário: vários erros de uma vez
    Dado um env sem JWT_SECRET e sem ADMIN_API_KEY
    Quando validarEnv é chamado
    Então a mensagem do erro lista as duas variáveis
```

### U2. `date-only.ts`

```gherkin
Funcionalidade: Datas sem hora

  Cenário: data ISO válida
    Dado "2026-10-18"
    Quando ehDataISO é chamado
    Então devolve true

  Cenário: formato inválido
    Dado cada um de "18/10/2026", "2026-1-8", "2026-10-18T00:00:00Z", "" e "abc"
    Quando ehDataISO é chamado
    Então devolve false

  Cenário: data de calendário inexistente
    Dado cada um de "2026-02-30", "2026-13-01" e "2026-00-10"
    Quando ehDataISO é chamado
    Então devolve false

  Cenário: 29 de fevereiro
    Dado "2028-02-29" e "2026-02-29"
    Quando ehDataISO é chamado
    Então devolve true para 2028 (bissexto) e false para 2026

  Cenário: paraDataISO com valor inválido
    Dado "2026-02-30"
    Quando paraDataISO é chamado
    Então lança AppError VALIDACAO_INVALIDA

  Cenário: hoje em São Paulo antes da meia-noite local
    Dado agora = 2026-10-19T02:30:00Z
    Quando hojeNoFuso("America/Sao_Paulo") é chamado
    Então devolve "2026-10-18"

  Cenário: hoje em São Paulo depois da meia-noite local
    Dado agora = 2026-10-19T03:00:00Z
    Quando hojeNoFuso("America/Sao_Paulo") é chamado
    Então devolve "2026-10-19"

  Cenário: fusos diferentes no mesmo instante
    Dado agora = 2026-10-19T03:30:00Z
    Quando hojeNoFuso é chamado com "America/Sao_Paulo" e com "America/Manaus"
    Então devolve "2026-10-19" para São Paulo e "2026-10-18" para Manaus

  Cenário: virada de ano
    Dado agora = 2027-01-01T02:59:59Z
    Quando hojeNoFuso("America/Sao_Paulo") é chamado
    Então devolve "2026-12-31"

  Cenário: formatador reaproveitado
    Dado hojeNoFuso chamado duas vezes com o mesmo fuso
    Quando o construtor de Intl.DateTimeFormat é espionado
    Então ele é instanciado uma única vez para esse fuso

  Cenário: fuso válido e inválido
    Dado "America/Sao_Paulo", "UTC", "America/Noronha", "Brasil/Leste" e "Mars/Olympus"
    Quando ehFusoValido é chamado
    Então devolve true para os três primeiros e false para os dois últimos

  Cenário: comparar datas
    Dado os pares ("2026-10-18","2026-10-19"), ("2026-10-19","2026-10-19") e ("2026-12-01","2026-10-31")
    Quando compararDatas é chamado
    Então devolve -1, 0 e 1

  Cenário: formatar dia e mês
    Dado "2026-03-05"
    Quando formatarDiaMes é chamado
    Então devolve "05/03"
```

### U3. `money.ts`

```gherkin
Funcionalidade: Valores em centavos

  Cenário: centavos válidos
    Dado 0, 1, 1990 e 99999999
    Quando ehCentavosValido é chamado
    Então devolve true

  Cenário: centavos inválidos
    Dado -1, 19.9, NaN, Infinity, "1990", null e 100000000
    Quando ehCentavosValido é chamado
    Então devolve false

  Cenário: formatação em reais
    Dado 1990, 5, 100 e 123456
    Quando centavosParaReais é chamado
    Então devolve "19,90", "0,05", "1,00" e "1.234,56"
```

### U4. `text.ts`

```gherkin
Funcionalidade: Normalização de texto

  Cenário: ordenação pt-BR ignora acento e caixa
    Dado ["Óleo", "arroz", "Açúcar", "feijão", "Abacaxi"]
    Quando ordenado com compararTextoPtBr
    Então resulta ["Abacaxi", "Açúcar", "arroz", "feijão", "Óleo"]

  Cenário: ordenação numérica natural
    Dado ["Item 10", "Item 2"]
    Quando ordenado com compararTextoPtBr
    Então resulta ["Item 2", "Item 10"]

  Cenário: normalizar espaços
    Dado "  Mercado   Bom \t Preço  "
    Quando normalizarEspacos é chamado
    Então devolve "Mercado Bom Preço"

  Cenário: normalizar e-mail
    Dado " Ana@BomPreco.COM.br "
    Quando normalizarEmail é chamado
    Então devolve "ana@bompreco.com.br"

  Cenário: WhatsApp celular com máscara
    Dado "(11) 98765-4321"
    Quando normalizarWhatsappBr é chamado
    Então devolve "+5511987654321"

  Cenário: WhatsApp já com DDI
    Dado "+55 11 98765-4321" e "5511987654321"
    Quando normalizarWhatsappBr é chamado
    Então devolve "+5511987654321" nos dois casos

  Cenário: WhatsApp fixo com 10 dígitos
    Dado "(61) 3333-4444"
    Quando normalizarWhatsappBr é chamado
    Então devolve "+556133334444"

  Cenário: WhatsApp inválido
    Dado cada um de "98765-4321" (sem DDD), "(01) 98765-4321" (DDD começando com 0), "(11) 88765-4321" (11 dígitos sem 9), "119876543210" (12 dígitos sem DDI), "" e "abc"
    Quando normalizarWhatsappBr é chamado
    Então devolve null

  Cenário: CNPJ válido com e sem máscara
    Dado "11.222.333/0001-81" e "11222333000181"
    Quando normalizarCnpj é chamado
    Então devolve "11222333000181"

  Cenário: CNPJ com dígito verificador errado
    Dado "11.222.333/0001-82"
    Quando normalizarCnpj é chamado
    Então devolve null

  Cenário: CNPJ com dígitos repetidos
    Dado "00.000.000/0000-00" e "11111111111111"
    Quando normalizarCnpj é chamado
    Então devolve null

  Cenário: CNPJ com tamanho errado
    Dado "1122233300018" e "112223330001811"
    Quando normalizarCnpj é chamado
    Então devolve null
```

### U5. Erros — `AppError`, `traduzirErroPg`, `errosDeValidacaoParaAppError`, `AppExceptionFilter`

```gherkin
Funcionalidade: Contrato de erros

  Cenário: AppError com mensagem padrão
    Dado AppError(EMAIL_JA_CADASTRADO) sem mensagem
    Quando inspecionado
    Então a mensagem é o texto padrão em português
    E o status mapeado é 409

  Cenário: todo código tem status e mensagem
    Dado cada valor do enum CodigoErro
    Quando consultado o mapa de status e o de mensagens
    Então todos têm entrada

  Cenário: unique de e-mail
    Dado um erro Sequelize com parent.code "23505" e constraint "lojistas_email_key"
    Quando traduzirErroPg é chamado
    Então devolve AppError EMAIL_JA_CADASTRADO

  Cenário: exclusion de panfleto
    Dado parent.code "23P01" e constraint "panfletos_periodo_sem_sobreposicao"
    Quando traduzirErroPg é chamado
    Então devolve AppError PANFLETO_PERIODO_SOBREPOSTO

  Cenário: check mapeado
    Dado parent.code "23514" e uma constraint registrada em CONSTRAINT_PARA_CODIGO
    Quando traduzirErroPg é chamado
    Então devolve o código mapeado

  Cenário: check não mapeado
    Dado parent.code "23514" e constraint "desconhecida_check"
    Quando traduzirErroPg é chamado
    Então devolve VALIDACAO_INVALIDA

  Cenário: chave estrangeira
    Dado parent.code "23503"
    Quando traduzirErroPg é chamado
    Então devolve RECURSO_NAO_ENCONTRADO

  Cenário: erro PG desconhecido
    Dado parent.code "42P01"
    Quando traduzirErroPg é chamado
    Então devolve null

  Cenário: erros de validação aninhados
    Dado ValidationError de "email" (2 mensagens) e de "endereco.cep" (1 mensagem)
    Quando errosDeValidacaoParaAppError é chamado
    Então devolve VALIDACAO_INVALIDA com detalhes.campos { "email": [2 mensagens], "endereco.cep": [1 mensagem] }

  Cenário: filtro com AppError
    Dado um handler que lança AppError(LOJISTA_DESATIVADO)
    Quando o filtro processa
    Então responde 403 com { erro: { codigo: "LOJISTA_DESATIVADO", mensagem } }
    E inclui o header x-request-id

  Cenário: filtro com 404 de rota do Nest
    Dado NotFoundException do Nest
    Quando o filtro processa
    Então responde 404 RECURSO_NAO_ENCONTRADO

  Cenário: filtro com ThrottlerException
    Dado ThrottlerException
    Quando o filtro processa
    Então responde 429 MUITAS_TENTATIVAS

  Cenário: filtro com erro de constraint
    Dado UniqueConstraintError com constraint "lojistas_email_key"
    Quando o filtro processa
    Então responde 409 EMAIL_JA_CADASTRADO

  Cenário: filtro com erro inesperado
    Dado new Error("falha secreta com stack")
    Quando o filtro processa
    Então responde 500 ERRO_INTERNO
    E o corpo não contém "falha secreta" nem stack
    E o logger recebe nível error com a stack
```

### U6. `TenantContext` e `@TenantId()`

```gherkin
Funcionalidade: Contexto do tenant

  Cenário: definir e obter
    Dado um contexto CLS ativo
    Quando definir("t1") e depois obter()
    Então devolve "t1"

  Cenário: obter sem definir
    Dado um contexto CLS ativo sem tenant
    Quando obter()
    Então devolve undefined

  Cenário: obrigatório sem tenant
    Dado um contexto CLS ativo sem tenant
    Quando obterObrigatorio()
    Então lança NAO_AUTENTICADO

  Cenário: contextos isolados entre requisições concorrentes
    Dado duas execuções CLS simultâneas com "t1" e "t2"
    Quando cada uma lê o tenant após um await
    Então cada uma vê o próprio tenant

  Cenário: decorator sem usuário
    Dado request sem user
    Quando @TenantId() é resolvido
    Então lança NAO_AUTENTICADO
```

### U7. Trava de tenant — `exigeTenantNoWhere` e `registrarHooksDeTenant`

```gherkin
Funcionalidade: Trava de tenant no ORM (RN07, RNF04)

  Cenário: where com tenantId string
    Dado { id: "x", tenantId: "t1" }
    Quando exigeTenantNoWhere é chamado
    Então devolve true

  Cenário: where com Op.eq
    Dado { tenantId: { [Op.eq]: "t1" } }
    Quando exigeTenantNoWhere é chamado
    Então devolve true

  Cenário: tenantId dentro de Op.and
    Dado { [Op.and]: [{ tenantId: "t1" }, { nome: "a" }] }
    Quando exigeTenantNoWhere é chamado
    Então devolve true

  Cenário: where ausente
    Dado undefined
    Quando exigeTenantNoWhere é chamado
    Então devolve false

  Cenário: tenantId nulo, indefinido ou vazio
    Dado { tenantId: null }, { tenantId: undefined } e { tenantId: "" }
    Quando exigeTenantNoWhere é chamado
    Então devolve false

  Cenário: tenantId só dentro de Op.or
    Dado { [Op.or]: [{ tenantId: "t1" }, { id: "x" }] }
    Quando exigeTenantNoWhere é chamado
    Então devolve false

  Cenário: tenantId com Op.in de vários valores
    Dado { tenantId: { [Op.in]: ["t1", "t2"] } }
    Quando exigeTenantNoWhere é chamado
    Então devolve false

  Cenário: hook bloqueia findAll sem tenant
    Dado ModeloFicticio marcado com @TenantScoped e hooks registrados
    Quando findAll({ where: { id: "x" } })
    Então lança TenantScopeViolationError antes de consultar o banco

  Cenário: hook libera findAll com tenant
    Dado o mesmo modelo
    Quando findAll({ where: { tenantId: "t1" } })
    Então a consulta segue

  Cenário: skipTenantScope explícito
    Dado o mesmo modelo
    Quando findAll({ where: { id: "x" }, skipTenantScope: true })
    Então a consulta segue

  Cenário: count, bulk update, bulk destroy e bulk restore sem tenant
    Dado o mesmo modelo
    Quando count, update, destroy e restore são chamados com where sem tenantId
    Então cada um lança TenantScopeViolationError

  Cenário: modelo não marcado não é afetado
    Dado o model Lojista (não @TenantScoped)
    Quando findOne({ where: { email } })
    Então a consulta segue

  Cenário: save de instância sem tenantId
    Dado uma instância de ModeloFicticio existente com tenantId vazio
    Quando save() é chamado
    Então lança TenantScopeViolationError
```

### U8. `SenhaService`

```gherkin
Funcionalidade: Hash de senha

  Cenário: gerar e verificar
    Dado a senha "senhaForte1"
    Quando gerarHash e depois verificar(hash, "senhaForte1")
    Então verificar devolve true
    E o hash começa com "$argon2id$"

  Cenário: senha errada
    Dado um hash de "senhaForte1"
    Quando verificar(hash, "senhaForte2")
    Então devolve false

  Cenário: hashes diferentes para a mesma senha
    Dado gerarHash chamado duas vezes com "senhaForte1"
    Então os hashes são diferentes (salt)

  Cenário: hash malformado
    Dado o hash "nao-e-um-hash"
    Quando verificar é chamado
    Então devolve false sem lançar
```

### U9. `LojistasService`

Mocks: `lojistaModel`, `ativacaoModel`, `sequelize.transaction` (executa o callback com um `t` falso), `SenhaService` e `StatusLojistaCache`.

```gherkin
Funcionalidade: Cadastro do lojista (RN01, RN02, RN37)

  Cenário: cadastro com sucesso sem CNPJ
    Dado que o e-mail "ana@bompreco.com.br" não existe
    Quando cadastrar é chamado com dados válidos e cnpj null
    Então lojistaModel.create recebe id UUID v7, os campos normalizados, senhaHash e cnpj null
    E ativacaoModel.create recebe lojistaId e status AGUARDANDO_ATIVACAO
    E as duas criações usam a mesma transação
    E o retorno tem status AGUARDANDO_ATIVACAO
    E o retorno não expõe senhaHash

  Cenário: cadastro com CNPJ
    Dado dados válidos com cnpj "11222333000181"
    Quando cadastrar é chamado
    Então lojistaModel.create recebe cnpj "11222333000181"

  Cenário: e-mail já cadastrado
    Dado que findOne por e-mail devolve um lojista
    Quando cadastrar é chamado
    Então lança EMAIL_JA_CADASTRADO
    E SenhaService.gerarHash não é chamado
    E nenhuma transação é aberta

  Cenário: hash gerado fora da transação
    Dado que o e-mail não existe
    Quando cadastrar é chamado
    Então gerarHash é chamado antes de sequelize.transaction

  Cenário: falha ao criar a ativação desfaz o cadastro
    Dado ativacaoModel.create rejeitando
    Quando cadastrar é chamado
    Então o erro é propagado
    E a transação é revertida (o callback rejeita)

  Cenário: corrida de e-mail no banco
    Dado lojistaModel.create rejeitando com UniqueConstraintError
    Quando cadastrar é chamado
    Então o erro é propagado sem tratamento (o filtro converte)

Funcionalidade: Consulta e edição dos dados do lojista

  Cenário: obter por tenant
    Dado um lojista "t1" com status ATIVO
    Quando obterPorTenant("t1")
    Então devolve o lojista e o status ATIVO
    E findOne foi chamado com where { id: "t1" } e include ativacao

  Cenário: obter tenant inexistente
    Dado findOne devolvendo null
    Quando obterPorTenant("t1")
    Então lança RECURSO_NAO_ENCONTRADO

  Cenário: editar só nome fantasia
    Dado um lojista existente
    Quando editar("t1", { nomeFantasia: "Novo" })
    Então só nomeFantasia muda
    E save é chamado uma vez

  Cenário: remover CNPJ
    Dado um lojista com CNPJ
    Quando editar("t1", { cnpj: null })
    Então cnpj fica null

  Cenário: edição sem mudança real
    Dado um lojista com nomeFantasia "Mercado"
    Quando editar("t1", { nomeFantasia: "Mercado" })
    Então save não é chamado
    E devolve o lojista

  Cenário: editar tenant inexistente
    Dado findOne devolvendo null
    Quando editar é chamado
    Então lança RECURSO_NAO_ENCONTRADO

Funcionalidade: Busca para login

  Cenário: e-mail existente
    Dado um lojista com o e-mail informado
    Quando buscarParaLogin é chamado
    Então usa o escopo comSenha
    E devolve lojista com senhaHash e status

  Cenário: e-mail inexistente
    Dado findOne devolvendo null
    Quando buscarParaLogin é chamado
    Então devolve null

Funcionalidade: Redefinição de senha pelo administrador (RN36)

  Cenário: redefinir com sucesso
    Dado um lojista existente
    Quando redefinirSenha("id", "novaSenha123")
    Então update recebe { senhaHash: <novo hash> } com where { id: "id" }
    E o logger registra admin.senha_redefinida sem a senha

  Cenário: lojista inexistente
    Dado update devolvendo [0]
    Quando redefinirSenha é chamado
    Então lança RECURSO_NAO_ENCONTRADO

Funcionalidade: Status do lojista

  Cenário: status existente
    Dado ativacao com status DESATIVADO
    Quando obterStatus("t1")
    Então devolve DESATIVADO e consulta só a coluna status

  Cenário: sem ativação
    Dado ativacaoModel.findOne devolvendo null
    Quando obterStatus("t1")
    Então devolve null
```

### U10. `StatusLojistaCache`

```gherkin
Funcionalidade: Cache do status do lojista

  Cenário: primeira leitura consulta o banco
    Dado um cache vazio
    Quando obter("t1")
    Então carregar é chamado uma vez

  Cenário: segunda leitura dentro do TTL
    Dado obter("t1") já feito
    Quando obter("t1") de novo antes de 30 s
    Então carregar continua com 1 chamada

  Cenário: leitura após o TTL
    Dado obter("t1") já feito
    Quando o tempo avança 30.001 ms (fake timers) e obter("t1") é chamado
    Então carregar é chamado de novo

  Cenário: leituras concorrentes
    Dado um cache vazio
    Quando obter("t1") é chamado 10 vezes em paralelo
    Então carregar é chamado uma única vez

  Cenário: invalidar
    Dado "t1" em cache
    Quando invalidar("t1") e depois obter("t1")
    Então carregar é chamado de novo

  Cenário: lojista inexistente não é cacheado
    Dado carregar devolvendo null
    Quando obter("t1") duas vezes
    Então carregar é chamado duas vezes
```

### U11. `AuthService`

Mocks: `LojistasService`, `SenhaService`, `JwtService` (real, com segredo de teste) e `ClockService` fixo.

```gherkin
Funcionalidade: Login do lojista (RN05, RNF05)

  Cenário: login com sucesso
    Dado um lojista ATIVO com a senha "senhaForte1"
    Quando login({ email, senha: "senhaForte1" })
    Então devolve token, expiraEm e lojistaView
    E o token decodificado tem sub = id do lojista e typ = "lojista"
    E expiraEm = agora + 8h

  Cenário: login de lojista aguardando ativação
    Dado um lojista AGUARDANDO_ATIVACAO com credenciais corretas
    Quando login é chamado
    Então devolve token

  Cenário: login de lojista desativado
    Dado um lojista DESATIVADO com credenciais corretas
    Quando login é chamado
    Então devolve token (painel só de consulta)

  Cenário: senha errada
    Dado um lojista existente
    Quando login com senha errada
    Então lança CREDENCIAIS_INVALIDAS

  Cenário: e-mail inexistente com tempo igualado
    Dado buscarParaLogin devolvendo null
    Quando login é chamado
    Então SenhaService.verificar é chamado com HASH_FICTICIO
    E lança CREDENCIAIS_INVALIDAS

  Cenário: mesma mensagem para e-mail e senha
    Dado os dois casos de falha acima
    Então as duas mensagens de erro são idênticas

  Cenário: expiração configurável
    Dado JWT_EXPIRES_IN = "1h"
    Quando emitirToken é chamado
    Então expiraEm = agora + 1h

Funcionalidade: Cadastro com sessão

  Cenário: cadastrar já devolve sessão
    Dado LojistasService.cadastrar resolvendo um lojista
    Quando AuthService.cadastrar é chamado
    Então devolve lojistaView com status AGUARDANDO_ATIVACAO, token e expiraEm
```

### U12. `JwtAuthGuard`

```gherkin
Funcionalidade: Autenticação do painel

  Cenário: rota pública
    Dado um handler com @Public()
    Quando o guard executa sem Authorization
    Então libera

  Cenário: token válido
    Dado "Authorization: Bearer <token válido de t1>"
    Quando o guard executa
    Então libera
    E req.user.tenantId = "t1"
    E TenantContext.obter() = "t1"

  Cenário: sem header
    Dado uma rota protegida sem Authorization
    Quando o guard executa
    Então lança NAO_AUTENTICADO

  Cenário: esquema diferente de Bearer
    Dado "Authorization: Basic abc"
    Quando o guard executa
    Então lança NAO_AUTENTICADO

  Cenário: token expirado
    Dado um token emitido há 9h com expiração 8h
    Quando o guard executa
    Então lança NAO_AUTENTICADO

  Cenário: assinatura inválida
    Dado um token assinado com outro segredo
    Quando o guard executa
    Então lança NAO_AUTENTICADO

  Cenário: typ diferente de lojista
    Dado um token válido com typ "admin"
    Quando o guard executa
    Então lança NAO_AUTENTICADO

  Cenário: token com alg none
    Dado um token sem assinatura (alg "none")
    Quando o guard executa
    Então lança NAO_AUTENTICADO
```

### U13. `TenantStatusGuard`

```gherkin
Funcionalidade: Permissões por status do lojista (RN08, tabela de status)

  Esquema do Cenário: status x método
    Dado um lojista com status <status>
    Quando uma requisição <metodo> chega numa rota do painel
    Então o resultado é <resultado>

    Exemplos:
      | status              | metodo | resultado               |
      | AGUARDANDO_ATIVACAO | GET    | libera                  |
      | AGUARDANDO_ATIVACAO | POST   | libera                  |
      | AGUARDANDO_ATIVACAO | PATCH  | libera                  |
      | AGUARDANDO_ATIVACAO | DELETE | libera                  |
      | ATIVO               | GET    | libera                  |
      | ATIVO               | POST   | libera                  |
      | ATIVO               | PUT    | libera                  |
      | ATIVO               | DELETE | libera                  |
      | DESATIVADO          | GET    | libera                  |
      | DESATIVADO          | HEAD   | libera                  |
      | DESATIVADO          | POST   | 403 LOJISTA_DESATIVADO  |
      | DESATIVADO          | PUT    | 403 LOJISTA_DESATIVADO  |
      | DESATIVADO          | PATCH  | 403 LOJISTA_DESATIVADO  |
      | DESATIVADO          | DELETE | 403 LOJISTA_DESATIVADO  |

  Cenário: rota pública ignora status
    Dado um handler @Public()
    Quando o guard executa
    Então libera sem consultar o cache

  Cenário: lojista inexistente
    Dado cache devolvendo null
    Quando o guard executa
    Então lança NAO_AUTENTICADO

  Cenário: escrita permitida por decorator
    Dado um lojista DESATIVADO e um handler POST com @SomenteLeituraPermitida()
    Quando o guard executa
    Então libera

  Cenário: status disponível para o controller
    Dado um lojista ATIVO
    Quando o guard libera
    Então req.statusLojista = ATIVO

  Cenário: reativação reflete após o TTL (RN08)
    Dado um lojista DESATIVADO em cache
    Quando o banco passa a ATIVO e o TTL expira
    Então um PATCH passa a ser liberado
```

### U14. `AdminKeyGuard`

```gherkin
Funcionalidade: Proteção do endpoint administrativo (RN36)

  Cenário: chave correta
    Dado X-Admin-Key igual a ADMIN_API_KEY
    Quando o guard executa
    Então libera

  Cenário: sem header
    Dado uma requisição sem X-Admin-Key
    Quando o guard executa
    Então lança RECURSO_NAO_ENCONTRADO

  Cenário: chave errada do mesmo tamanho
    Dado uma chave com o mesmo comprimento e 1 caractere diferente
    Quando o guard executa
    Então lança RECURSO_NAO_ENCONTRADO

  Cenário: chave errada de tamanho diferente
    Dado a chave "x"
    Quando o guard executa
    Então lança RECURSO_NAO_ENCONTRADO sem erro de buffer

  Cenário: comparação em tempo constante
    Dado crypto.timingSafeEqual espionado
    Quando o guard executa com qualquer chave
    Então timingSafeEqual é chamado com dois buffers de 32 bytes

  Cenário: log sem a chave
    Dado uma chave errada "segredo-errado"
    Quando o guard executa
    Então o logger registra admin.chave_invalida com o ip
    E nenhum argumento do log contém "segredo-errado"
```

### U15. `LoginThrottlerGuard`

```gherkin
Funcionalidade: Limite de tentativas de login (RNF05)

  Cenário: chave de rastreio por IP e e-mail
    Dado req.ip "1.2.3.4" e body.email " Ana@X.com "
    Quando getTracker é chamado
    Então devolve "1.2.3.4:ana@x.com"

  Cenário: corpo sem e-mail
    Dado req.ip "1.2.3.4" e body vazio
    Quando getTracker é chamado
    Então devolve "1.2.3.4:"

  Cenário: excesso de tentativas
    Dado o limite de 5 em 900 s
    Quando a 6ª tentativa chega com a mesma chave
    Então lança exceção convertida em 429 MUITAS_TENTATIVAS
```

### U16. DTOs

Testados com `plainToInstance` + `validate`, sem Nest.

```gherkin
Funcionalidade: Validação do cadastro (RN01)

  Cenário: corpo válido mínimo
    Dado nomeFantasia, nomeResponsavel, email, senha e whatsapp válidos e sem cnpj
    Quando validado
    Então não há erros
    E cnpj fica undefined

  Cenário: normalizações
    Dado email " Ana@X.COM ", whatsapp "(11) 98765-4321", nomeFantasia "  Bom   Preço " e cnpj "11.222.333/0001-81"
    Quando transformado
    Então email "ana@x.com", whatsapp "+5511987654321", nomeFantasia "Bom Preço" e cnpj "11222333000181"

  Cenário: cnpj vazio
    Dado cnpj ""
    Quando transformado
    Então cnpj é null e não há erro

  Esquema do Cenário: campo obrigatório ausente
    Dado o corpo válido sem <campo>
    Quando validado
    Então há erro em <campo>

    Exemplos:
      | campo           |
      | nomeFantasia    |
      | nomeResponsavel |
      | email           |
      | senha           |
      | whatsapp        |

  Esquema do Cenário: senha inválida
    Dado senha <senha>
    Quando validado
    Então há erro em senha

    Exemplos:
      | senha          |
      | "abc1234"      |
      | "somenteletra" |
      | "12345678"     |
      | 129 caracteres |

  Cenário: senha não é aparada
    Dado senha " senhaForte1 "
    Quando transformado
    Então senha permanece " senhaForte1 "

  Cenário: nome curto e longo demais
    Dado nomeFantasia "A" e depois 121 caracteres
    Quando validado
    Então há erro em nomeFantasia nos dois casos

  Cenário: e-mail inválido
    Dado email "ana@" e depois "ana bompreco.com"
    Quando validado
    Então há erro em email

  Cenário: WhatsApp inválido
    Dado whatsapp "98765-4321"
    Quando validado
    Então há erro em whatsapp com mensagem em português

  Cenário: CNPJ inválido
    Dado cnpj "11.222.333/0001-82"
    Quando validado
    Então há erro em cnpj

Funcionalidade: Validação da edição do lojista

  Cenário: corpo vazio
    Dado {}
    Quando validado
    Então há erro "Informe ao menos um campo."

  Cenário: campo proibido
    Dado { email: "novo@x.com" } com o ValidationPipe da app
    Quando validado
    Então é recusado (forbidNonWhitelisted)

  Cenário: cnpj null explícito
    Dado { cnpj: null }
    Quando validado
    Então não há erros

Funcionalidade: Validação do login e da redefinição de senha

  Cenário: login sem senha
    Dado { email: "a@x.com" }
    Quando validado
    Então há erro em senha

  Cenário: login com senha fraca é aceito no DTO
    Dado { email: "a@x.com", senha: "1" }
    Quando validado
    Então não há erros (força só é exigida no cadastro)

  Cenário: nova senha fraca
    Dado { novaSenha: "abc" }
    Quando validado
    Então há erro em novaSenha
```

### U17. View e controllers

```gherkin
Funcionalidade: View do lojista

  Cenário: campos expostos
    Dado um model com senhaHash, logoPath e cores preenchidos
    Quando lojistaView é chamada com status ATIVO
    Então o resultado tem exatamente id, nomeFantasia, nomeResponsavel, email, whatsapp, cnpj, status e criadoEm
    E criadoEm é ISO 8601

Funcionalidade: Mapeamento dos controllers

  Cenário: GET /painel/lojista
    Dado LojistasService.obterPorTenant mockado
    Quando o controller é chamado com tenantId "t1"
    Então chama obterPorTenant("t1") e devolve lojistaView

  Cenário: PATCH /painel/lojista
    Dado um DTO válido
    Quando o controller é chamado
    Então chama editar("t1", dto) e devolve lojistaView

  Cenário: POST /auth/cadastro
    Dado um DTO válido
    Quando o controller é chamado
    Então chama AuthService.cadastrar e responde com o status 201

  Cenário: PATCH /admin/lojistas/:id/senha
    Dado um id e um DTO válidos
    Quando o controller é chamado
    Então chama LojistasService.redefinirSenha(id, novaSenha) e responde 204
```

### Exemplo de implementação Jest

`src/modules/lojistas/__tests__/lojistas.service.cadastro.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { validate as ehUuid, version as versaoUuid } from 'uuid';
import { LojistasService } from '../services/lojistas.service';
import { SenhaService } from '../services/senha.service';
import { StatusLojistaCache } from '../services/status-lojista.cache';
import { Lojista } from '../models/lojista.model';
import { LojistaAtivacao, StatusLojista } from '../models/lojista-ativacao.model';
import { AppError } from '@common/errors/app.error';
import { CodigoErro } from '@common/errors/codigos-erro';
import { umCadastroDeLojista } from '../../../../test/factories/lojista.factory';

describe('Funcionalidade: Cadastro do lojista (RN01, RN02, RN37)', () => {
  let service: LojistasService;
  const transacao = { id: 'tx' };
  const lojistaModel = { findOne: jest.fn(), create: jest.fn() };
  const ativacaoModel = { create: jest.fn() };
  const sequelize = { transaction: jest.fn((cb: (t: unknown) => unknown) => cb(transacao)) };
  const senhaService = { gerarHash: jest.fn().mockResolvedValue('$argon2id$hash') };

  beforeEach(async () => {
    jest.clearAllMocks();
    const modulo = await Test.createTestingModule({
      providers: [
        LojistasService,
        { provide: getModelToken(Lojista), useValue: lojistaModel },
        { provide: getModelToken(LojistaAtivacao), useValue: ativacaoModel },
        { provide: Sequelize, useValue: sequelize },
        { provide: SenhaService, useValue: senhaService },
        { provide: StatusLojistaCache, useValue: { invalidar: jest.fn() } },
      ],
    }).compile();
    service = modulo.get(LojistasService);
  });

  describe('Cenário: cadastro com sucesso sem CNPJ', () => {
    describe('Dado que o e-mail "ana@bompreco.com.br" não existe', () => {
      beforeEach(() => {
        lojistaModel.findOne.mockResolvedValue(null);
        lojistaModel.create.mockImplementation(async (dados) => ({ ...dados }));
        ativacaoModel.create.mockImplementation(async (dados) => ({ ...dados }));
      });

      describe('Quando cadastrar é chamado com dados válidos e cnpj null', () => {
        const dto = umCadastroDeLojista().comEmail('ana@bompreco.com.br').semCnpj().build();

        it('Então lojistaModel.create recebe id UUID v7, campos normalizados e senhaHash', async () => {
          await service.cadastrar(dto);
          const [dados] = lojistaModel.create.mock.calls[0];
          expect(ehUuid(dados.id) && versaoUuid(dados.id)).toBe(7);
          expect(dados).toMatchObject({ email: 'ana@bompreco.com.br', senhaHash: '$argon2id$hash', cnpj: null });
        });

        it('E a ativação nasce AGUARDANDO_ATIVACAO na mesma transação', async () => {
          await service.cadastrar(dto);
          const [dadosLojista, opcoesLojista] = lojistaModel.create.mock.calls[0];
          const [dadosAtivacao, opcoesAtivacao] = ativacaoModel.create.mock.calls[0];
          expect(dadosAtivacao).toEqual({ lojistaId: dadosLojista.id, status: StatusLojista.AGUARDANDO_ATIVACAO });
          expect(opcoesLojista.transaction).toBe(transacao);
          expect(opcoesAtivacao.transaction).toBe(transacao);
        });

        it('E o hash é gerado antes de abrir a transação', async () => {
          await service.cadastrar(dto);
          expect(senhaService.gerarHash.mock.invocationCallOrder[0])
            .toBeLessThan(sequelize.transaction.mock.invocationCallOrder[0]);
        });
      });
    });
  });

  describe('Cenário: e-mail já cadastrado', () => {
    describe('Dado que findOne por e-mail devolve um lojista', () => {
      beforeEach(() => lojistaModel.findOne.mockResolvedValue({ id: 'existente' }));

      describe('Quando cadastrar é chamado', () => {
        it('Então lança EMAIL_JA_CADASTRADO', async () => {
          await expect(service.cadastrar(umCadastroDeLojista().build()))
            .rejects.toMatchObject<Partial<AppError>>({ codigo: CodigoErro.EMAIL_JA_CADASTRADO });
        });

        it('E não gera hash nem abre transação', async () => {
          await service.cadastrar(umCadastroDeLojista().build()).catch(() => undefined);
          expect(senhaService.gerarHash).not.toHaveBeenCalled();
          expect(sequelize.transaction).not.toHaveBeenCalled();
        });
      });
    });
  });
});
```

## Testes de integração (Testcontainers)

| Arquivo | Cenários |
| --- | --- |
| `migrations.int-spec.ts` | Todas as migrations aplicam do zero; `undo:all` reverte; extensões `citext` e `btree_gist` existem; `CHECK` de WhatsApp, CNPJ e cores recusa valores inválidos inseridos via SQL; `UNIQUE(email)` recusa `ANA@X.COM` depois de `ana@x.com` (citext); trigger atualiza `atualizado_em` no `UPDATE` de status |
| `auth.int-spec.ts` | `POST /v1/auth/cadastro` → 201 com token e status `AGUARDANDO_ATIVACAO`, e a linha em `lojista_ativacoes` existe; e-mail duplicado com caixa diferente → 409 `EMAIL_JA_CADASTRADO`; cadastros simultâneos com o mesmo e-mail → um 201 e um 409; login correto → 200; senha errada → 401 `CREDENCIAIS_INVALIDAS`; 6ª tentativa → 429 `MUITAS_TENTATIVAS` com `Retry-After`; tentativas com outro e-mail no mesmo IP não somam; resposta nunca contém `senhaHash` |
| `painel-lojista.int-spec.ts` | `GET` sem token → 401; `GET` com token → 200; `PATCH` válido → 200 e persistido; `PATCH` com `email` → 400; lojista `DESATIVADO` (via SQL + espera do TTL configurado em 0 no teste): `GET` → 200 e `PATCH` → 403 `LOJISTA_DESATIVADO`; reativado → `PATCH` → 200 com os dados intactos (RN08) |
| `admin.int-spec.ts` | Sem chave → 404 no formato padrão; chave errada → 404; chave certa com id inexistente → 404; id não UUID → 404; sem chave e corpo inválido → 404 (nunca 400); chave certa e senha fraca → 400; sucesso → 204, login com a senha antiga → 401 e com a nova → 200; rota inexistente `/v1/admin/xyz` responde igual a sem chave |
| `tenant-scope.int-spec.ts` | Com um model de teste `@TenantScoped` registrado só no container de teste: consulta sem `tenantId` lança antes de chegar ao banco (log de queries vazio); com `tenantId` retorna só as linhas do tenant; `skipTenantScope` funciona |
| `vazamento-lojista.int-spec.ts` | Lojistas A e B: o token de A em `GET /v1/painel/lojista` devolve só os dados de A; não existe rota que aceite o id de outro lojista (verificação estática: nenhuma rota de `painel` tem parâmetro `:lojistaId`/`:tenantId`); `descreverVazamentoEntreTenants` validado com um recurso fictício |
| `erros.int-spec.ts` | Rota inexistente → 404 `RECURSO_NAO_ENCONTRADO`; JSON malformado → 400 `VALIDACAO_INVALIDA`; toda resposta tem `x-request-id`; o `x-request-id` recebido é propagado |

## Critério de pronto

- [x] `npm run db:up && npm run db:migrate` funciona do zero, e `db:migrate:undo:all` reverte sem erro.
- [x] A app não sobe com env inválido e mostra quais variáveis estão erradas.
- [x] Todos os cenários U1 a U17 implementados como `*.spec.ts` no padrão BDD e passando.
- [x] Todos os testes de integração da tabela acima passando com `npm run test:int`.
- [x] Cobertura de `services/`, `domain/`, `common/utils` e `database/tenant-scope.hooks.ts` ≥ 90% (linhas e branches); global ≥ 80%.
- [x] ESLint sem erros, incluindo as regras `no-restricted-imports` de MVC e `no-restricted-syntax` de relógio.
- [x] Nenhuma resposta da API contém `senhaHash`, e os logs não contêm senha, token nem chave admin (teste de integração inspecionando a saída do pino).
- [x] `src/database/admin-ativacao.sql` com os comandos de ativação e desativação documentados.
- [x] Coleção Postman (ou `api/http/fase-1.http`) com cadastro, login, `GET/PATCH` do painel e redefinição de senha admin (com a variável `adminKey` como secreta).
- [x] Documento de regras de back-end sem divergência com o que foi implementado.

## Implementação (18/10/2026)

Fase concluída: 292 testes unitários e 45 de integração passando. A cobertura ficou em 97,8% de linhas e 94,6% de branches, e todos os gates por pasta foram atingidos.

Desvios em relação a este plano, todos já refletidos no código:

| Item | Plano | Implementado | Motivo |
| --- | --- | --- | --- |
| Runtime | Node 22 | Testado no Node 24 (`engines: >=22`) | Versão instalada na máquina; o código não usa nada exclusivo do 24 |
| Aliases `@common/*` etc. | Paths no tsconfig | Imports relativos | O `nest build` não reescreve aliases, e o `dist` quebraria em runtime |
| Config do `sequelize-cli` | `dist/database/sequelize.config.cli.js` | `src/database/sequelize-cli.config.js` (JS puro) | As migrations rodam sem build prévio |
| `LoginThrottlerGuard` | Guard que estende `ThrottlerGuard` | Throttlers nomeados `login`, `cadastro` e `admin` em `common/throttle/limites-de-requisicao.ts`, com `skipIf` e `@LimitarRequisicoes(nome)` | O throttler v6 suporta `getTracker` e `skipIf` por throttler; tudo fica num lugar só e configurado pelo env |
| `Retry-After` | Header do throttler | O filtro copia `Retry-After-<nome>` para `Retry-After` | Throttlers nomeados usam header com sufixo |
| `StatusLojista` | Enum dentro do model | `models/status-lojista.ts` | Guards de `common/` usam o enum sem importar o model |
| `StatusLojistaCache` | Recebe `ConfigService` | Recebe `ttlMs`, `carregar` e um relógio opcional, montado por factory no `LojistasModule` | Testável sem Nest; `ttlMs <= 0` desliga o cache, que é o que o teste de integração usa |
| `LojistasService` | Depende do `StatusLojistaCache` | Não depende | Nesta fase nada no processo altera o status, e a dependência criaria um ciclo |
| JWT | `expiresIn` relativo ao relógio real | `iat` e `clockTimestamp` vêm do `ClockService` | Emissão e validação usam o mesmo relógio, que é fixo nos testes |
| `@AoMenosUmCampo()` | Validador de classe | Propriedade fantasma `corpo` no DTO | O class-validator não tem validador de classe; o erro aparece em `detalhes.campos.corpo` |
| Logger | Configurado no `AppModule` | `config/logger.config.ts`, com `destinoDeLogs` para os testes capturarem a saída | Teste de integração de que os logs não vazam credenciais |
| Constraint EXCLUDE | `panfletos_periodo_excl` | `panfletos_periodo_sem_sobreposicao` | Nome definido na Fase 3 |
| Cobertura | Provider padrão com `isolatedModules` | Provider padrão sem `isolatedModules` | Com `isolatedModules` o TS emite metadados de decorators como branches condicionais que nunca executam |
| Coleção | Postman ou `.http` | `http/fase-1.http` | `@adminKey` lido do `.env` |

Para rodar localmente: `npm run db:up && npm run db:migrate && npm run start:dev`. Os testes de integração exigem o Docker rodando.
