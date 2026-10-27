'use strict';

/** RN44: chave "mostrar só o panfleto", por lojista. Coluna com default: o código anterior segue funcionando. */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE lojistas ADD COLUMN se_panfleto boolean NOT NULL DEFAULT false;
      COMMENT ON COLUMN lojistas.se_panfleto IS
        'RN44: true = a página pública mostra só o panfleto vigente (se houver).';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE lojistas DROP COLUMN se_panfleto;');
  },
};
