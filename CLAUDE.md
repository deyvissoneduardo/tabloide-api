# CLAUDE.md

## Visão do Projeto
API do Tabloide Digital: lojistas (tenants) cadastram filiais, panfletos, categorias e produtos com vigência, publicados numa página pública por filial. Otimiza isolamento entre lojistas (RNF04/RNF05), deploy sem downtime e regras de negócio rastreáveis (IDs RN/RNF).

## Stack
- NestJS 11 + TypeScript 5.9 estrito (CommonJS), Node 22 (`.nvmrc`), npm (`package-lock.json`).
- Postgres 16 + Sequelize 6 / `sequelize-typescript`; migrations JS via `sequelize-cli`.
- DTOs: `class-validator`/`class-transformer`. Env: `zod` em `src/config/env.schema.ts`.
- Testes: Jest 29 + ts-jest, supertest, Testcontainers (Postgres). Deploy: Vercel (`vercel.json`, build em `scripts/vercel-build.sh`).
- NÃO usar: TypeORM/Prisma/Mongoose, zod em DTO, class-validator em env, `process.env` fora de `src/config` (use `AppConfig`).

## Como rodar
- Install `npm ci` · Banco local `npm run db:up && npm run db:migrate` · Dev `npm run start:dev`
- Lint `npm run lint` · Typecheck `npm run typecheck` · Build `npm run build`
- Unit `npm test` · Cobertura `npm run test:cov` · Integração `npm run test:int` (precisa de Docker)

## Regras de comportamento (não negocie)
1. **Incerteza → leia o arquivo ou rode `grep`. Nunca chute.** Se não achou (função, campo, API, arquivo), diga que não achou.
2. **Menor delta possível.** Resolva só o pedido. Oportunidade de melhoria fora do escopo → reporte separado, não execute sem pedir.
3. **Não toque em código fora do escopo sem autorização explícita.** Viu algo errado → sinalize, não conserte por conta própria.
4. **"Funciona" só com evidência.** Ao afirmar que algo funciona, mostre o output do comando/teste. Não rodou → diga "não rodei".
5. **Ações destrutivas exigem confirmação prévia.** Migração de schema, delete em massa, mudança de CI/auth → confirme antes de executar.

## Convenções
- Identificadores, arquivos, rotas, códigos de erro e nomes de teste em pt-BR (`criar`, `listar`, `CodigoErro.RECURSO_NAO_ENCONTRADO`, `describe('Funcionalidade: ...')`). NÃO nomeie domínio em inglês.
- Camadas (ESLint): controller não importa model; view não importa service nem sequelize; `domain/` sem `@nestjs/*` nem sequelize; service não importa controller.
- Em `services/` e `domain/`: NÃO use `new Date()`/`Date.now()` — use `ClockService.agora()`.
- Erro de negócio: `new AppError(CodigoErro.X)`; código novo entra em `CodigoErro`, `STATUS_POR_CODIGO` e `MENSAGEM_POR_CODIGO`. Constraint do Postgres → mapear em `src/common/errors/pg-erros.ts`, sem try/catch no service.
- Parâmetro UUID de rota usa `ParseUuidOu404Pipe`. PK UUID v7 gerada no service.
- Commits: Conventional Commits em pt-BR, `tipo(escopo): adiciona …` (3ª pessoa do presente), citando RN/RNF quando houver.

## Multi-tenant (crítico)
- Model com dados de lojista recebe `@TenantScoped()`; toda query/update/destroy leva `tenantId` no where (senão `TenantScopeViolationError`).
- `tenantId` vem de `@TenantId()` (JWT) e é o 1º argumento do service. NUNCA do body da requisição.
- NÃO use `skipTenantScope` fora do módulo `publico`.
- Views NUNCA expõem `tenantId`, `deletedAt`, hashes nem paths internos. Recurso de outro lojista responde 404.

## Onde coisas novas vão
- Módulo: `src/modules/<plural>/{<nome>.module.ts, controllers/, services/, models/, dtos/, views/, domain/, __tests__/}`; importar em `src/app.module.ts`. Exemplar: `src/modules/panfletos/`.
- Rotas: controller sem versão (prefixo `v1` global em `src/app.setup.ts`). Rotas são autenticadas por padrão; liberar só com `@Public()`.
- Antes de criar helper, procure em `src/common/{utils,validators,errors,dtos}` e `src/modules/vigencia/` (datas, período, situação). NÃO reimplemente.
- Migration: `src/database/migrations/YYYYMMDDHHMMSS-<verbo>-<tabela>.js`, SQL cru com `up` e `down`. Tabela nova → adicionar em `TABELAS` de `test/helpers/banco-de-teste.ts`.
- Testes: unit em `src/**/__tests__/*.spec.ts`; integração em `test/integration/**/*.int-spec.ts`; factories em `test/factories/`.
- Rota nova → requisição de exemplo no `http/fase-N.http` da fase.

## Testing & Quality Bar
- "Feito" = `lint` + `typecheck` + `test:cov` verdes (gate: 80% global, 90% em `services/` e `common/utils`, 100% em `vigencia/domain`) e `test:int` quando tocar banco/rota.
- Recurso com tenant ganha cenários de vazamento via `descreverVazamentoEntreTenants` (`test/helpers/vazamento.ts`).

## Safe-Change Rules
- Toda migration reverte (rode localmente up → undo:all → up; não há mais CI) e é compatível com o código anterior (expandir → migrar → contrair): o rollback de deploy não reverte migrations.
- Exclusão é lógica (`paranoid`). NÃO apague registros nem sobrescreva arquivos de mídia.
- NÃO logue segredos/PII (`authorization`, `x-admin-key`, senha, chave do Supabase); `.env` nunca é versionado.
- Mudança em auth, guards globais, `tenant-scope.hooks.ts`, build da Vercel ou `vercel.json` → confirme antes.

<!-- Itere este arquivo: erro que estava neste contrato → fortaleça a regra existente;
     erro que NÃO estava → adicione uma regra nova. -->
