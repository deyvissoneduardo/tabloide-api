import { ParseUuidOu404Pipe } from '../../../common/pipes/parse-uuid-ou-404.pipe';
import { SemLimitesVerificador } from '../../../common/limites/verificador-limites';
import type { AppConfig } from '../../../config/app.config';
import {
  ALFABETO_CODIGO,
  NanoidGeradorCodigoPublico,
  TAMANHO_CODIGO,
} from '../services/gerador-codigo-publico';

describe('Funcionalidade: Gerador de código público (RN39)', () => {
  describe('Cenário: formato do código', () => {
    it('Então gera 8 caracteres do alfabeto sem ambíguos, compatível com o CHECK do banco', () => {
      const gerador = new NanoidGeradorCodigoPublico();
      const codigos = Array.from({ length: 200 }, () => gerador.gerar());
      for (const codigo of codigos) {
        expect(codigo).toHaveLength(TAMANHO_CODIGO);
        expect(codigo).toMatch(/^[2-9a-hjkmnp-zA-HJ-NP-Z]{8}$/);
      }
      expect(new Set(codigos).size).toBe(codigos.length);
      expect(ALFABETO_CODIGO).not.toMatch(/[01ilIoO]/);
    });
  });
});

describe('Funcionalidade: Limites sem plano (gancho RNF12)', () => {
  const verificador = new SemLimitesVerificador({ maxImagemBytes: 123 } as AppConfig);

  it('Cenário: criações sempre liberadas', async () => {
    await expect(verificador.verificarCriacaoFilial()).resolves.toBeUndefined();
    await expect(verificador.verificarCriacaoProduto()).resolves.toBeUndefined();
  });

  it('Cenário: teto de imagem vem da configuração', () =>
    expect(verificador.maxImagemBytes()).resolves.toBe(123));
});

describe('Funcionalidade: ParseUuidOu404Pipe', () => {
  const pipe = new ParseUuidOu404Pipe();

  it('Cenário: UUID v7 passa', async () =>
    expect(await pipe.transform('01a1515d-b305-743a-95f9-d8d6c26afe23', { type: 'param' })).toBe(
      '01a1515d-b305-743a-95f9-d8d6c26afe23',
    ));

  it.each(['abc', '123e4567-e89b-12d3-a456-426614174000'])('Cenário: "%s" vira RECURSO_NAO_ENCONTRADO', (v) =>
    expect(pipe.transform(v, { type: 'param' })).rejects.toMatchObject({ codigo: 'RECURSO_NAO_ENCONTRADO' }),
  );
});
