'use strict';
/**
 * LGPD: versão e momento do aceite dos Termos de Uso e da Política de Privacidade no cadastro, e o
 * encerramento da conta a pedido do lojista. Só expande: colunas NULL (lojistas antigos não têm aceite)
 * e o código anterior ignora as colunas.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE lojistas
        ADD COLUMN termos_versao     varchar(20) NULL,
        ADD COLUMN termos_aceitos_em timestamptz NULL,
        ADD COLUMN encerrado_em      timestamptz NULL,
        ADD CONSTRAINT lojistas_aceite_termos_ck CHECK ((termos_versao IS NULL) = (termos_aceitos_em IS NULL));
      -- o expurgo futuro procura contas encerradas há mais de 6 meses
      CREATE INDEX lojistas_encerrado_em_idx ON lojistas (encerrado_em) WHERE encerrado_em IS NOT NULL;
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX lojistas_encerrado_em_idx;
      ALTER TABLE lojistas
        DROP CONSTRAINT lojistas_aceite_termos_ck,
        DROP COLUMN encerrado_em,
        DROP COLUMN termos_aceitos_em,
        DROP COLUMN termos_versao;
    `);
  },
};
