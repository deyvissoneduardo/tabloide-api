import type { AppDeTeste } from '../helpers/app-de-teste';

export interface CategoriaCriada {
  id: string;
  nome: string;
}

/** Cria uma categoria pela rota real do painel. */
export async function criarCategoria(
  app: AppDeTeste,
  token: string,
  filialId: string,
  nome = 'Mercearia',
): Promise<CategoriaCriada> {
  const resposta = await app
    .http()
    .post(`/v1/painel/filiais/${filialId}/categorias`)
    .set('Authorization', `Bearer ${token}`)
    .send({ nome });
  if (resposta.status !== 201) throw new Error(`categoria não criada: ${resposta.status} ${resposta.text}`);
  return resposta.body;
}
