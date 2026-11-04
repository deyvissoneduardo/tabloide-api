'use strict';

/**
 * RN44: a chave "mostrar só o panfleto" passa a ser por filial. Expandir: lojistas.se_panfleto fica
 * (apps antigos e rollback do deploy); cada filial herda a escolha atual do seu lojista.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE filiais ADD COLUMN se_panfleto boolean NOT NULL DEFAULT false;
      COMMENT ON COLUMN filiais.se_panfleto IS
        'RN44: true = a página pública desta filial mostra só o panfleto vigente (se houver).';
      UPDATE filiais f SET se_panfleto = l.se_panfleto
        FROM lojistas l
       WHERE l.id = f.tenant_id AND l.se_panfleto;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE filiais DROP COLUMN se_panfleto;');
  },
};
