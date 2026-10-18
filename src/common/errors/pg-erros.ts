import { AppError } from './app.error';
import { CodigoErro } from './codigos-erro';

/** Constraints UNIQUE com código de negócio próprio. */
export const UNIQUE_PARA_CODIGO: Record<string, CodigoErro> = {
  lojistas_email_key: CodigoErro.EMAIL_JA_CADASTRADO,
};

/** Constraints EXCLUDE com código de negócio próprio. */
export const EXCLUSAO_PARA_CODIGO: Record<string, CodigoErro> = {
  panfletos_periodo_sem_sobreposicao: CodigoErro.PANFLETO_PERIODO_SOBREPOSTO,
};

/** Constraints CHECK com código de negócio próprio. As fases seguintes acrescentam entradas. */
export const CONSTRAINT_PARA_CODIGO: Record<string, CodigoErro> = {};

interface ErroPg {
  parent?: { code?: string; constraint?: string };
  original?: { code?: string; constraint?: string };
}

export function traduzirErroPg(err: unknown): AppError | null {
  if (typeof err !== 'object' || err === null) return null;
  const pg = (err as ErroPg).parent ?? (err as ErroPg).original;
  if (!pg?.code) return null;
  const constraint = pg.constraint ?? '';

  switch (pg.code) {
    case '23505':
      return new AppError(UNIQUE_PARA_CODIGO[constraint] ?? CodigoErro.VALIDACAO_INVALIDA);
    case '23P01':
      return new AppError(EXCLUSAO_PARA_CODIGO[constraint] ?? CodigoErro.VALIDACAO_INVALIDA);
    case '23514':
      return new AppError(CONSTRAINT_PARA_CODIGO[constraint] ?? CodigoErro.VALIDACAO_INVALIDA);
    case '23503':
      return new AppError(CodigoErro.RECURSO_NAO_ENCONTRADO);
    default:
      return null;
  }
}
