'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // no Supabase as extensões ficam no schema "extensions" (DB_EXTENSIONS_SCHEMA=extensions)
    const schema = process.env.DB_EXTENSIONS_SCHEMA;
    await queryInterface.sequelize.query(
      `CREATE EXTENSION IF NOT EXISTS btree_gist${schema ? ` WITH SCHEMA ${schema}` : ''};`,
    );
    await queryInterface.sequelize.query(`
      CREATE TABLE panfletos (
        id              uuid        PRIMARY KEY,
        tenant_id       uuid        NOT NULL REFERENCES lojistas(id),
        filial_id       uuid        NOT NULL REFERENCES filiais(id),
        imagem_path     text        NOT NULL,
        imagem_largura  integer     NOT NULL CHECK (imagem_largura > 0),
        imagem_altura   integer     NOT NULL CHECK (imagem_altura > 0),
        data_inicio     date        NOT NULL,
        data_limite     date        NULL,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        deleted_at      timestamptz NULL,
        CONSTRAINT panfletos_datas_validas CHECK (data_limite IS NULL OR data_limite >= data_inicio)
      );

      -- RN16: rede de segurança contra corrida. daterange com limite NULL = infinito;
      -- '[]' inclui os extremos: terminar e começar no mesmo dia é sobreposição (RN24).
      ALTER TABLE panfletos
        ADD CONSTRAINT panfletos_periodo_sem_sobreposicao
        EXCLUDE USING gist (
          filial_id WITH =,
          daterange(data_inicio, data_limite, '[]') WITH &&
        ) WHERE (deleted_at IS NULL);

      CREATE INDEX panfletos_filial_inicio_ativos ON panfletos (filial_id, data_inicio DESC) WHERE deleted_at IS NULL;
      CREATE INDEX panfletos_tenant ON panfletos (tenant_id);
    `);
  },

  // btree_gist não é removida: outras tabelas podem usar
  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE panfletos;');
  },
};
