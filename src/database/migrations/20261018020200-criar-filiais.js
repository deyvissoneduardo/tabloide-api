'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE filiais (
        id              uuid PRIMARY KEY,
        tenant_id       uuid         NOT NULL REFERENCES lojistas(id) ON DELETE RESTRICT,
        nome            varchar(120) NOT NULL,
        endereco        varchar(300) NOT NULL,
        fuso_horario    varchar(64)  NOT NULL DEFAULT 'America/Sao_Paulo',
        codigo_publico  varchar(8)   NOT NULL,
        created_at      timestamptz  NOT NULL DEFAULT now(),
        updated_at      timestamptz  NOT NULL DEFAULT now(),
        deleted_at      timestamptz  NULL,
        -- não é parcial: o código de uma filial excluída nunca é reaproveitado (RN39, D1)
        CONSTRAINT filiais_codigo_publico_uk UNIQUE (codigo_publico),
        CONSTRAINT filiais_codigo_publico_formato_ck
          CHECK (codigo_publico ~ '^[2-9a-hjkmnp-zA-HJ-NP-Z]{8}$'),
        CONSTRAINT filiais_nome_nao_vazio_ck CHECK (length(btrim(nome)) > 0),
        CONSTRAINT filiais_endereco_nao_vazio_ck CHECK (length(btrim(endereco)) > 0)
      );

      CREATE INDEX filiais_tenant_ativas_idx ON filiais (tenant_id) WHERE deleted_at IS NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE filiais;');
  },
};
