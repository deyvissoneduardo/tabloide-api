import type { AppDeTeste } from '../helpers/app-de-teste';

export interface FilialCriada {
  id: string;
  codigoPublico: string;
  fusoHorario: string;
}

/** Cria uma filial pela rota real do painel. */
export async function criarFilial(
  app: AppDeTeste,
  token: string,
  dados: { nome?: string; endereco?: string; fusoHorario?: string } = {},
): Promise<FilialCriada> {
  const resposta = await app
    .http()
    .post('/v1/painel/filiais')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome: 'Centro', endereco: 'Rua A, 100', ...dados })
    .expect(201);
  return resposta.body;
}
