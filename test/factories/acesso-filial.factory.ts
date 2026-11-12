import type { Sequelize } from 'sequelize';

export interface AcessoSemeado {
  data: string;
  hora: number;
  quantidade: number;
}

/** Semeia séries de acessos direto no banco, como o upsert da página pública gravaria. */
export async function criarAcessos(
  sequelize: Sequelize,
  filial: { tenantId: string; filialId: string },
  acessos: AcessoSemeado[],
): Promise<void> {
  for (const a of acessos) {
    await sequelize.query(
      `INSERT INTO acessos_filial (tenant_id, filial_id, data, hora, quantidade)
       VALUES (:tenantId, :filialId, :data, :hora, :quantidade)`,
      { replacements: { ...filial, ...a } },
    );
  }
}

export async function lerAcessos(sequelize: Sequelize, filialId: string) {
  const [linhas] = await sequelize.query(
    `SELECT to_char(data, 'YYYY-MM-DD') AS data, hora, quantidade
     FROM acessos_filial WHERE filial_id = :filialId ORDER BY data, hora`,
    { replacements: { filialId } },
  );
  return linhas as Array<{ data: string; hora: number; quantidade: number }>;
}
