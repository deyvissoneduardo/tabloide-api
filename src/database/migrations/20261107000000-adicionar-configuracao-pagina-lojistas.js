'use strict';

/**
 * RN46–RN48: aparência da página pública por lojista (banner, nome da categoria e 10 cores) num jsonb.
 * Expandir: cor_primaria/cor_secundaria ficam (apps antigos e rollback); as cores atuais são copiadas
 * para o JSON, que vira a fonte de verdade. O down devolve às colunas as cores editadas no período.
 * Sem CHECK no jsonb: o formato é validado no DTO e normalizado na leitura.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE lojistas ADD COLUMN configuracao_pagina jsonb NOT NULL DEFAULT '{}'::jsonb;
      COMMENT ON COLUMN lojistas.configuracao_pagina IS
        'RN46-RN48: aparência da página pública (banner, exibirNomeCategoria, cores). Chave ausente = padrão.';
      UPDATE lojistas SET configuracao_pagina = jsonb_build_object(
        'cores', jsonb_strip_nulls(jsonb_build_object('primaria', cor_primaria, 'secundaria', cor_secundaria))
      ) WHERE cor_primaria IS NOT NULL OR cor_secundaria IS NOT NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE lojistas SET
        cor_primaria   = configuracao_pagina #>> '{cores,primaria}',
        cor_secundaria = configuracao_pagina #>> '{cores,secundaria}';
      ALTER TABLE lojistas DROP COLUMN configuracao_pagina;
    `);
  },
};
