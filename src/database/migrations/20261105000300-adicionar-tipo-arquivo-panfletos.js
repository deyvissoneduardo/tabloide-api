'use strict';

/**
 * RN13: panfleto em imagem (WebP processado) ou PDF de 1 página (guardado como veio).
 * imagem_path/largura/altura não são renomeadas: o rename quebraria o código anterior no deploy.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE panfletos ADD COLUMN tipo_arquivo varchar(10) NOT NULL DEFAULT 'IMAGEM'
        CONSTRAINT panfletos_tipo_arquivo_ck CHECK (tipo_arquivo IN ('IMAGEM', 'PDF'));
      COMMENT ON COLUMN panfletos.tipo_arquivo IS 'RN13: IMAGEM (WebP processado) ou PDF (original, 1 página).';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE panfletos DROP COLUMN tipo_arquivo;');
  },
};
