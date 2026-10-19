'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE categorias (
        id                uuid         PRIMARY KEY,
        tenant_id         uuid         NOT NULL REFERENCES lojistas(id),
        filial_id         uuid         NOT NULL REFERENCES filiais(id),
        nome              varchar(80)  NOT NULL,
        nome_normalizado  varchar(80)  NOT NULL,
        created_at        timestamptz  NOT NULL DEFAULT now(),
        updated_at        timestamptz  NOT NULL DEFAULT now(),
        deleted_at        timestamptz  NULL,
        CONSTRAINT categorias_nome_nao_vazio_ck CHECK (length(btrim(nome)) > 0)
      );

      -- Listagem do painel e verificação de pertencimento
      CREATE INDEX categorias_filial_ativas_idx
        ON categorias (tenant_id, filial_id, nome_normalizado)
        WHERE deleted_at IS NULL;

      -- D4.4: nome único por filial entre as não excluídas
      CREATE UNIQUE INDEX categorias_filial_nome_uk
        ON categorias (filial_id, nome_normalizado)
        WHERE deleted_at IS NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE categorias;');
  },
};
