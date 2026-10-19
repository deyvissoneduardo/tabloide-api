import { imagens } from '../helpers/imagens';
import type { AppDeTeste } from '../helpers/app-de-teste';

export interface PanfletoCriado {
  id: string;
  urlImagem: string;
  dataInicio: string;
  dataLimite: string | null;
  situacao: string;
}

/** Envia um panfleto pela rota real, com um JPEG pequeno gerado na hora. */
export function enviarPanfleto(
  app: AppDeTeste,
  token: string,
  filialId: string,
  datas: { dataInicio?: string; dataLimite?: string } = {},
  imagem?: Buffer,
) {
  return (async () => {
    const req = app
      .http()
      .post(`/v1/painel/filiais/${filialId}/panfletos`)
      .set('Authorization', `Bearer ${token}`)
      .attach('imagem', imagem ?? (await imagens.jpeg(120, 160)), {
        filename: 'folheto.jpg',
        contentType: 'image/jpeg',
      });
    for (const [campo, valor] of Object.entries(datas)) req.field(campo, valor);
    return req;
  })();
}

export async function criarPanfleto(
  app: AppDeTeste,
  token: string,
  filialId: string,
  datas: { dataInicio?: string; dataLimite?: string } = {},
): Promise<PanfletoCriado> {
  const resposta = await enviarPanfleto(app, token, filialId, datas);
  if (resposta.status !== 201) throw new Error(`panfleto não criado: ${resposta.status} ${resposta.text}`);
  return resposta.body;
}
