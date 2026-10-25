'use strict';

/**
 * Endereço estruturado da filial (1:1). Remove filiais.endereco no mesmo passo, sem
 * expandir/contrair: não havia dados reais e o texto livre não converte para os campos.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE filial_enderecos (
        filial_id    uuid         PRIMARY KEY REFERENCES filiais(id) ON DELETE RESTRICT,
        tenant_id    uuid         NOT NULL REFERENCES lojistas(id) ON DELETE RESTRICT,
        cep          char(8)      NOT NULL,
        logradouro   varchar(200) NOT NULL,
        numero       varchar(20)  NOT NULL,
        complemento  varchar(100) NULL,
        bairro       varchar(100) NOT NULL,
        cidade       varchar(100) NOT NULL,
        uf           varchar(2)   NOT NULL,
        created_at   timestamptz  NOT NULL DEFAULT now(),
        updated_at   timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT filial_enderecos_cep_formato_ck CHECK (cep ~ '^[0-9]{8}$'),
        CONSTRAINT filial_enderecos_campos_nao_vazios_ck CHECK (
          length(btrim(logradouro)) > 0 AND length(btrim(numero)) > 0 AND length(btrim(bairro)) > 0
          AND length(btrim(cidade)) > 0 AND length(btrim(uf)) > 0
        )
      );

      ALTER TABLE filiais DROP COLUMN endereco;
    `);
  },

  /** Remonta o texto a partir do endereço; filial sem endereço volta com '-'. */
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE filiais ADD COLUMN endereco varchar(300) NULL;

      UPDATE filiais f
      SET endereco = left(e.logradouro || ', ' || e.numero || ' - ' || e.bairro || ', ' || e.cidade || '/' || e.uf, 300)
      FROM filial_enderecos e
      WHERE e.filial_id = f.id;

      UPDATE filiais SET endereco = '-' WHERE endereco IS NULL;

      ALTER TABLE filiais
        ALTER COLUMN endereco SET NOT NULL,
        ADD CONSTRAINT filiais_endereco_nao_vazio_ck CHECK (length(btrim(endereco)) > 0);

      DROP TABLE filial_enderecos;
    `);
  },
};
