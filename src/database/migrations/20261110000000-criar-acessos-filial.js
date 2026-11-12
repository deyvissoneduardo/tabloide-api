'use strict';

/**
 * Painel de acessos (RN50–RN58): contagem agregada por filial, data e hora locais.
 * No máximo 24 linhas por filial por dia e nenhum dado pessoal (RN51). Só expande:
 * o código anterior ignora a tabela. Sem paranoid: o contador não é um registro do lojista.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE acessos_filial (
        tenant_id   uuid     NOT NULL REFERENCES lojistas(id),
        filial_id   uuid     NOT NULL REFERENCES filiais(id),
        data        date     NOT NULL,
        hora        smallint NOT NULL CHECK (hora BETWEEN 0 AND 23),
        quantidade  integer  NOT NULL CHECK (quantidade > 0),
        PRIMARY KEY (filial_id, data, hora)
      );

      -- a PK é o alvo do ON CONFLICT e serve às leituras por filial; este índice serve ao resumo do lojista
      CREATE INDEX acessos_filial_tenant_data_idx ON acessos_filial (tenant_id, data);

      -- RLS sem políticas: bloqueia o acesso direto pelo Supabase; o dono (a API) não é afetado
      ALTER TABLE acessos_filial ENABLE ROW LEVEL SECURITY;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE acessos_filial;');
  },
};
