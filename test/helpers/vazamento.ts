import type { AppDeTeste } from './app-de-teste';

type Metodo = 'get' | 'patch' | 'delete' | 'put' | 'post';

export interface RecursoDeTenant {
  nome: string;
  criarComo: (token: string) => Promise<{ id: string }>;
  rotas: Array<{ metodo: Metodo; caminho: (id: string) => string; corpo?: object }>;
  /** Lê o recurso como o dono, para confirmar que ficou intacto. */
  lerComo: (token: string, id: string) => Promise<unknown>;
}

/**
 * Gera os cenários de vazamento entre tenants (RNF04): o lojista B tenta cada rota sobre
 * o recurso de A e recebe 404 RECURSO_NAO_ENCONTRADO; o recurso de A continua igual.
 */
export function descreverVazamentoEntreTenants(
  contexto: () => { app: AppDeTeste; tokenA: string; tokenB: string },
  recurso: RecursoDeTenant,
): void {
  describe(`Funcionalidade: isolamento de ${recurso.nome} entre lojistas (RNF04)`, () => {
    for (const rota of recurso.rotas) {
      describe(`Cenário: lojista B chama ${rota.metodo.toUpperCase()} no recurso de A`, () => {
        it('Então recebe 404 RECURSO_NAO_ENCONTRADO e o recurso de A continua intacto', async () => {
          const { app, tokenA, tokenB } = contexto();
          const { id } = await recurso.criarComo(tokenA);
          const antes = await recurso.lerComo(tokenA, id);

          const resposta = await app
            .http()
            [rota.metodo](rota.caminho(id))
            .set('Authorization', `Bearer ${tokenB}`)
            .send(rota.corpo ?? {});

          expect(resposta.status).toBe(404);
          expect(resposta.body.erro.codigo).toBe('RECURSO_NAO_ENCONTRADO');
          expect(await recurso.lerComo(tokenA, id)).toEqual(antes);
        });
      });
    }
  });
}
