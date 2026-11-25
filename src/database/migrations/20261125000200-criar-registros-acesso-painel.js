'use strict';
/**
 * Registros de acesso ao painel (Marco Civil da Internet, art. 15: guarda por 6 meses). Só requisições
 * de lojista autenticado e login/cadastro bem-sucedidos; a página pública não grava IP (RN51).
 * Sem user-agent nem corpo (minimização). Sem paranoid: o expurgo apaga de fato o que passar de 6 meses.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE registros_acesso_painel (
        id           uuid         PRIMARY KEY,
        tenant_id    uuid         NOT NULL REFERENCES lojistas(id),
        ip           inet         NULL,
        metodo       varchar(10)  NOT NULL,
        rota         varchar(500) NOT NULL,
        ocorrido_em  timestamptz  NOT NULL
      );
      CREATE INDEX registros_acesso_painel_tenant_idx ON registros_acesso_painel (tenant_id, ocorrido_em DESC);
      -- serve ao expurgo por idade
      CREATE INDEX registros_acesso_painel_ocorrido_em_idx ON registros_acesso_painel (ocorrido_em);
      -- RLS sem políticas: bloqueia o acesso direto pelo Supabase; o dono (a API) não é afetado
      ALTER TABLE registros_acesso_painel ENABLE ROW LEVEL SECURITY;
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE registros_acesso_painel;');
  },
};
