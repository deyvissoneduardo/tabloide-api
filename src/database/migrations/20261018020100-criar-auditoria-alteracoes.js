'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE auditoria_alteracoes (
        id              uuid PRIMARY KEY,
        tenant_id       uuid        NOT NULL REFERENCES lojistas(id) ON DELETE RESTRICT,
        entidade        varchar(30) NOT NULL,
        entidade_id     uuid        NOT NULL,
        campo           varchar(40) NOT NULL,
        valor_anterior  text        NULL,
        valor_novo      text        NULL,
        alterado_em     timestamptz NOT NULL,
        request_id      varchar(64) NULL,
        CONSTRAINT auditoria_entidade_ck CHECK (entidade IN ('FILIAL', 'PANFLETO', 'PRODUTO'))
      );

      CREATE INDEX auditoria_tenant_entidade_idx
        ON auditoria_alteracoes (tenant_id, entidade, entidade_id, alterado_em DESC);

      -- prova de oferta (RNF07): só inserção
      CREATE FUNCTION auditoria_bloquear_alteracao() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'auditoria_alteracoes é somente inserção' USING ERRCODE = '42501';
      END; $$ LANGUAGE plpgsql;

      CREATE TRIGGER auditoria_somente_insercao
        BEFORE UPDATE OR DELETE ON auditoria_alteracoes
        FOR EACH ROW EXECUTE FUNCTION auditoria_bloquear_alteracao();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER auditoria_somente_insercao ON auditoria_alteracoes;
      DROP FUNCTION auditoria_bloquear_alteracao();
      DROP TABLE auditoria_alteracoes;
    `);
  },
};
