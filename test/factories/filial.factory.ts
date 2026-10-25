import type { EnderecoFilial } from '../../src/modules/filiais/domain/endereco';
import type { AppDeTeste } from '../helpers/app-de-teste';
import { umEnderecoDto } from './endereco-filial.factory';

export interface FilialCriada {
  id: string;
  codigoPublico: string;
  fusoHorario: string;
  endereco: EnderecoFilial | null;
}

/** Cria uma filial pela rota real do painel. */
export async function criarFilial(
  app: AppDeTeste,
  token: string,
  dados: { nome?: string; endereco?: Record<string, unknown>; fusoHorario?: string } = {},
): Promise<FilialCriada> {
  const resposta = await app
    .http()
    .post('/v1/painel/filiais')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome: 'Centro', endereco: umEnderecoDto(), ...dados })
    .expect(201);
  return resposta.body;
}
