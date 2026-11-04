# Postman — Tabloide Digital API

Coleção com todas as rotas da API, separada por módulo, com documentação, exemplos de resposta e testes de status em cada requisição.

## Estrutura

| Caminho | O quê |
| --- | --- |
| `collections/Tabloide Digital API/` | Coleção no formato **v3** (YAML, uma requisição por arquivo). É a fonte de verdade: edite aqui e revise no PR |
| `environments/Tabloide dev.environment.yaml` | Ambiente local (`http://localhost:3000/v1`) |
| `environments/Tabloide prod.environment.yaml` | Ambiente de produção (`https://api.tabloide.app/v1`), sem nenhum segredo preenchido |
| `export/` | Coleção e ambientes em **v2.1 JSON**, para importar no app do Postman (*Import → arquivos*). É uma cópia gerada a partir da v3: depois de mudar a coleção, gere o export de novo ou importe a pasta v3 |
| `arquivos/exemplo.jpg` | Imagem usada nos uploads |
| `arquivos/exemplo.pdf` | PDF de 1 página usado em **Panfletos → Trocar panfleto por PDF** |

Módulos (pastas): `01 Auth`, `02 Lojista`, `03 Identidade visual`, `04 Filiais`, `05 Panfletos`, `06 Categorias`, `07 Produtos`, `08 Auditoria`, `09 Página pública`, `10 Saúde`, `11 Admin`, `12 Estrutura da página` (ordem das categorias e produtos da página de cada filial), `13 Aparência da página` (banner, nome da categoria e as 10 cores da página pública, RN46–RN48). A visão geral (autenticação, contrato de erros com "como tratar", rate limits e convenções) está na descrição da coleção.

## Variáveis

| Variável | Tipo | Como é preenchida |
| --- | --- | --- |
| `baseUrl` | default | Fixa por ambiente |
| `email`, `senha`, `novaSenha` | default / secret | Você preenche (em prod, só no valor local) |
| `adminKey` | secret | Você preenche com o `ADMIN_API_KEY` do servidor. Nunca versione nem sincronize o valor de prod |
| `token`, `lojistaId` | secret / default | Scripts de **Cadastrar lojista** e **Login** |
| `filialId`, `codigoPublico` | default | Script de **Criar filial** |
| `panfletoId`, `categoriaId`, `produtoId` | default | Scripts dos respectivos "criar" |
| `etag` | default | Script de **Página da filial** |
| `arquivoImagem` | default | Caminho da imagem dos uploads, relativo à pasta `api/` |
| `arquivoPdf` | default | Caminho do PDF de exemplo, relativo à pasta `api/` |

## Rodar pela linha de comando

Com a API rodando em dev (`npm run start:dev`) e o banco migrado:

```bash
postman collection run "postman/collections/Tabloide Digital API" \
  -e "postman/environments/Tabloide dev.environment.yaml" \
  --env-var "adminKey=$ADMIN_API_KEY" --working-dir .
```

A página pública (pastas 09 e **13 → Conferir na página pública**) só responde 200 para lojista **ATIVO**: depois do cadastro, ative o lojista no banco (`src/database/admin-ativacao.sql`). **Admin → Redefinir senha** troca a senha do lojista para `novaSenha`.

As exclusões de filial e de categoria criam um recurso temporário no script de pré-requisição e excluem ele, para a coleção rodar de ponta a ponta sem apagar a filial e a categoria usadas pelos módulos seguintes.

## Validar depois de editar

```bash
postman collection lint "postman/collections/Tabloide Digital API"
postman environment lint postman/environments --fail-severity warning
```
