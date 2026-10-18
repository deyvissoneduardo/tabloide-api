'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS citext;');
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS btree_gist;');
  },

  // As extensões não são removidas: outras bases podem usá-las.
  async down() {},
};
