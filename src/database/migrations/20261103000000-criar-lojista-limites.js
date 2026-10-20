'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE lojista_limites (
        lojista_id               uuid        PRIMARY KEY REFERENCES lojistas(id) ON DELETE RESTRICT,
        max_filiais              integer     NULL CHECK (max_filiais IS NULL OR max_filiais >= 0),
        max_produtos_por_filial  integer     NULL CHECK (max_produtos_por_filial IS NULL OR max_produtos_por_filial >= 0),
        max_imagem_bytes         integer     NULL CHECK (max_imagem_bytes IS NULL OR max_imagem_bytes > 0),
        created_at               timestamptz NOT NULL DEFAULT now(),
        updated_at               timestamptz NOT NULL DEFAULT now()
      );
      COMMENT ON TABLE lojista_limites IS
        'RNF12: limites por lojista. Sem linha ou coluna NULL = sem limite. Editada pelo administrador direto no banco.';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE lojista_limites;');
  },
};
