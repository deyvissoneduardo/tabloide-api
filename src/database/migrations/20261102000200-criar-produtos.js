'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE produtos (
        id                           uuid         PRIMARY KEY,
        tenant_id                    uuid         NOT NULL REFERENCES lojistas(id),
        filial_id                    uuid         NOT NULL REFERENCES filiais(id),
        categoria_id                 uuid         NOT NULL REFERENCES categorias(id),
        nome                         varchar(120) NOT NULL,
        nome_normalizado             varchar(120) NOT NULL,
        quantidade                   varchar(40)  NULL,
        preco_promocional_centavos   integer      NOT NULL,
        preco_original_centavos      integer      NULL,
        descricao                    varchar(500) NULL,
        observacao                   varchar(200) NULL,
        foto_path                    text         NULL,
        data_inicio                  date         NOT NULL,
        data_limite                  date         NULL,
        created_at                   timestamptz  NOT NULL DEFAULT now(),
        updated_at                   timestamptz  NOT NULL DEFAULT now(),
        deleted_at                   timestamptz  NULL,
        CONSTRAINT produtos_nome_nao_vazio_ck     CHECK (length(btrim(nome)) > 0),
        CONSTRAINT produtos_preco_promocional_ck  CHECK (preco_promocional_centavos > 0 AND preco_promocional_centavos <= 99999999),
        -- RN21
        CONSTRAINT produtos_preco_original_ck     CHECK (preco_original_centavos IS NULL OR preco_original_centavos > preco_promocional_centavos),
        CONSTRAINT produtos_preco_original_max_ck CHECK (preco_original_centavos IS NULL OR preco_original_centavos <= 99999999),
        -- RN42, parte estática: "limite >= hoje" depende do fuso da filial e fica no service
        CONSTRAINT produtos_datas_ck              CHECK (data_limite IS NULL OR data_limite >= data_inicio)
      );

      -- Lista do painel e consulta da página pública (Fase 5): filtra por filial e janela de datas
      CREATE INDEX produtos_filial_ativos_idx
        ON produtos (tenant_id, filial_id, data_inicio)
        WHERE deleted_at IS NULL;

      -- Ordenação alfabética do painel sem sort em memória
      CREATE INDEX produtos_filial_nome_idx
        ON produtos (filial_id, nome_normalizado, id)
        WHERE deleted_at IS NULL;

      -- Exclusão de categoria (RN20) e contagens por categoria
      CREATE INDEX produtos_categoria_ativos_idx
        ON produtos (categoria_id, data_limite)
        WHERE deleted_at IS NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE produtos;');
  },
};
