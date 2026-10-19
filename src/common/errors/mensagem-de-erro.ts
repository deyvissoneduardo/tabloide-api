/** Texto de um erro qualquer para log, sem stack. */
export function mensagemDeErro(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
