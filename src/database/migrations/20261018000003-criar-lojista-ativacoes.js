'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TYPE status_lojista AS ENUM ('AGUARDANDO_ATIVACAO', 'ATIVO', 'DESATIVADO');

      CREATE TABLE lojista_ativacoes (
        lojista_id      uuid PRIMARY KEY REFERENCES lojistas(id) ON DELETE RESTRICT,
        status          status_lojista NOT NULL DEFAULT 'AGUARDANDO_ATIVACAO',
        funcionalidades jsonb          NOT NULL DEFAULT '{}'::jsonb,
        observacao      text           NULL,
        atualizado_em   timestamptz    NOT NULL DEFAULT now()
      );

      CREATE INDEX lojista_ativacoes_status_idx ON lojista_ativacoes (status);

      -- atualizado_em automático, porque o administrador altera direto no banco (RN03)
      CREATE FUNCTION tocar_atualizado_em() RETURNS trigger AS $$
      BEGIN NEW.atualizado_em = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

      CREATE TRIGGER lojista_ativacoes_tocar
      BEFORE UPDATE ON lojista_ativacoes
      FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER lojista_ativacoes_tocar ON lojista_ativacoes;
      DROP FUNCTION tocar_atualizado_em();
      DROP TABLE lojista_ativacoes;
      DROP TYPE status_lojista;
    `);
  },
};
