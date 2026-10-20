# Preparação para a base de consumidores (RN33, RN34, RNF11)

Só documentação: nada disto está implementado no MVP. Registra o que já foi decidido para não travar a evolução.

## Modelo previsto

Tabela `consumidores`, `@TenantScoped`:

| Coluna | Tipo | Observação |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `tenant_id` | `uuid` FK `lojistas` | A base pertence ao lojista e é compartilhada entre as filiais (RN34): **sem** `filial_id` |
| `origem_filial_id` | `uuid` NULL | Opcional: onde a pessoa se cadastrou |
| `nome` | `varchar(120)` | |
| `whatsapp` | `varchar(20)` | E.164 |
| `consentimento_em` | `timestamptz NOT NULL` | |
| `consentimento_versao` | `varchar(20) NOT NULL` | Versão do texto aceito |
| `finalidade` | `text NOT NULL` | |
| `descadastrado_em` | `timestamptz NULL` | |
| `created_at`, `updated_at` | `timestamptz` | |

`UNIQUE (tenant_id, whatsapp)`.

- **Liberação por lojista**: `lojista_ativacoes.funcionalidades = { "consumidores": true }`, como prevê o RN04.
- **Rota pública futura**: `POST /v1/publico/filiais/:codigo/consumidores`, com rate limit mais rígido que a leitura e o mesmo 404 para lojista inativo.

## LGPD (RNF11)

Toda exclusão no sistema é lógica (RN25), mas o titular pode pedir a **eliminação** dos dados (art. 18, VI). Duas opções, a decidir com o advogado antes de implementar:

1. **Eliminação física** (`DELETE` real) da linha do consumidor: a única exceção à RN25, registrada como tal.
2. **Anonimização irreversível**: trocar `nome` e `whatsapp` por valores sem relação com a pessoa (ex.: hash com salt descartado), mantendo a linha para estatística.

Nos dois casos, os backups mantêm a cópia por até 30 dias ([backup.md](backup.md)). A política de privacidade deve informar isso, e toda restauração deve reaplicar os pedidos de eliminação registrados (tabela `pedidos_eliminacao` só com o hash do WhatsApp).
