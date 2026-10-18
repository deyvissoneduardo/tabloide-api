'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE lojistas (
        id               uuid PRIMARY KEY,
        nome_fantasia    varchar(120) NOT NULL,
        nome_responsavel varchar(120) NOT NULL,
        email            citext       NOT NULL,
        senha_hash       text         NOT NULL,
        whatsapp         varchar(20)  NOT NULL,
        cnpj             char(14)     NULL,
        logo_path        text         NULL,
        cor_primaria     char(7)      NULL,
        cor_secundaria   char(7)      NULL,
        created_at       timestamptz  NOT NULL DEFAULT now(),
        updated_at       timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT lojistas_email_key UNIQUE (email),
        CONSTRAINT lojistas_cor_primaria_check   CHECK (cor_primaria   IS NULL OR cor_primaria   ~ '^#[0-9A-F]{6}$'),
        CONSTRAINT lojistas_cor_secundaria_check CHECK (cor_secundaria IS NULL OR cor_secundaria ~ '^#[0-9A-F]{6}$'),
        CONSTRAINT lojistas_whatsapp_check CHECK (whatsapp ~ '^\\+55[1-9][0-9]{9,10}$'),
        CONSTRAINT lojistas_cnpj_check     CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$')
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE lojistas;');
  },
};
