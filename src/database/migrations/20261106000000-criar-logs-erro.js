'use strict';

/**
 * Erros inesperados (500) de produção, para consulta pelo painel do Supabase.
 * Sem tenant: é log técnico. Sem body nem headers, para não guardar PII nem segredos.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE logs_erro (
        id           uuid PRIMARY KEY,
        ocorrido_em  timestamptz  NOT NULL,
        request_id   varchar(64)  NULL,
        metodo       varchar(10)  NULL,
        rota         varchar(500) NULL,
        tipo         varchar(100) NULL,
        mensagem     text         NOT NULL,
        stack        text         NULL
      );

      CREATE INDEX logs_erro_ocorrido_em_idx ON logs_erro (ocorrido_em DESC);

      -- RLS sem políticas: a chave anon do PostgREST não lê stack traces; o dono (a API) não é afetado
      ALTER TABLE logs_erro ENABLE ROW LEVEL SECURITY;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE logs_erro;');
  },
};
