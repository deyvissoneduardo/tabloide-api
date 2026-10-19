import type { Sequelize } from 'sequelize';
import { v7 as uuidv7 } from 'uuid';
import type { AppDeTeste } from '../helpers/app-de-teste';

export interface ProdutoCriado {
  id: string;
  nome: string;
  situacao: string;
  urlFoto: string | null;
}

/** Cadastra um produto em JSON pela rota real. */
export async function criarProduto(
  app: AppDeTeste,
  token: string,
  filialId: string,
  categoriaId: string,
  dados: Record<string, unknown> = {},
): Promise<ProdutoCriado> {
  const resposta = await app
    .http()
    .post(`/v1/painel/filiais/${filialId}/produtos`)
    .set('Authorization', `Bearer ${token}`)
    .send({ nome: 'Arroz Tipo 1', categoriaId, precoPromocionalCentavos: 2199, ...dados });
  if (resposta.status !== 201) throw new Error(`produto não criado: ${resposta.status} ${resposta.text}`);
  return resposta.body;
}

/**
 * Insere direto no banco, para montar vencidos (a API não aceita datas no passado) e excluídos.
 * Gera um UUID v7, como a aplicação, para o id passar pelo ParseUuidOu404Pipe.
 */
export async function inserirProduto(
  sequelize: Sequelize,
  campos: {
    tenantId: string;
    filialId: string;
    categoriaId: string;
    nome?: string;
    inicio: string;
    limite: string | null;
    excluido?: boolean;
  },
): Promise<string> {
  const id = uuidv7();
  await sequelize.query(
    `INSERT INTO produtos (id, tenant_id, filial_id, categoria_id, nome, nome_normalizado,
                           preco_promocional_centavos, data_inicio, data_limite, deleted_at)
     VALUES (:id, :tenantId, :filialId, :categoriaId, :nome, lower(:nome), 1000, :inicio, :limite, :deletedAt)
`,
    {
      replacements: {
        ...campos,
        id,
        nome: campos.nome ?? 'Produto SQL',
        deletedAt: campos.excluido ? new Date('2026-10-15T12:00:00Z') : null,
      },
    },
  );
  return id;
}
