'use strict';

/**
 * RN45: ordem das categorias e dos produtos definida pelo lojista, por filial.
 * NULL = não posicionado (vai para o fim, em ordem alfabética). Sem índice: a ordenação é em memória.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE categorias ADD COLUMN posicao integer NULL
        CONSTRAINT categorias_posicao_ck CHECK (posicao IS NULL OR posicao >= 0);
      ALTER TABLE produtos ADD COLUMN posicao integer NULL
        CONSTRAINT produtos_posicao_ck CHECK (posicao IS NULL OR posicao >= 0);
      COMMENT ON COLUMN categorias.posicao IS 'RN45: ordem na filial; NULL = não posicionada (fim, alfabética).';
      COMMENT ON COLUMN produtos.posicao IS 'RN45: ordem dentro da categoria; NULL = não posicionado.';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE produtos DROP COLUMN posicao;
      ALTER TABLE categorias DROP COLUMN posicao;
    `);
  },
};
