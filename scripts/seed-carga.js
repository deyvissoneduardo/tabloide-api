// Seed do teste de carga (Fase 5, seção 10.14): 50 lojistas ativos, 2 filiais cada, 300 produtos
// por filial em 15 categorias e 1 panfleto vigente por filial. Grava os códigos públicos em
// test/carga/codigos.json. Uso: DATABASE_URL=... npm run seed:carga  (banco descartável!)
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { v7: uuidv7 } = require('uuid');
const { customAlphabet } = require('nanoid');

const ALFABETO = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const gerarCodigo = customAlphabet(ALFABETO, 8);
const LOJISTAS = 50;
const FILIAIS_POR_LOJISTA = 2;
const CATEGORIAS = 15;
const PRODUTOS_POR_FILIAL = 300;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('defina DATABASE_URL');
  const db = new Client({ connectionString: url });
  await db.connect();
  const codigos = [];
  const hoje = new Date().toISOString().slice(0, 10);

  try {
    await db.query('BEGIN');
    for (let l = 0; l < LOJISTAS; l++) {
      const lojista = uuidv7();
      await db.query(
        `INSERT INTO lojistas (id, nome_fantasia, nome_responsavel, email, senha_hash, whatsapp, cor_primaria)
         VALUES ($1, $2, 'Carga', $3, 'sem-login', '+5511987654321', '#C8102E')`,
        [lojista, `Mercado Carga ${l}`, `carga${l}-${lojista}@teste.com.br`],
      );
      await db.query(`INSERT INTO lojista_ativacoes (lojista_id, status) VALUES ($1, 'ATIVO')`, [lojista]);

      for (let f = 0; f < FILIAIS_POR_LOJISTA; f++) {
        const filial = uuidv7();
        const codigo = gerarCodigo();
        codigos.push(codigo);
        await db.query(
          `INSERT INTO filiais (id, tenant_id, nome, endereco, codigo_publico) VALUES ($1, $2, $3, 'Rua da Carga, 1', $4)`,
          [filial, lojista, `Filial ${f}`, codigo],
        );
        await db.query(
          `INSERT INTO panfletos (id, tenant_id, filial_id, imagem_path, imagem_largura, imagem_altura, data_inicio, data_limite)
           VALUES ($1, $2, $3, $4, 1600, 2263, $5::date - 1, $5::date + 7)`,
          [uuidv7(), lojista, filial, `${lojista}/panfleto/carga.webp`, hoje],
        );
        const categorias = [];
        for (let c = 0; c < CATEGORIAS; c++) {
          const id = uuidv7();
          categorias.push(id);
          await db.query(
            `INSERT INTO categorias (id, tenant_id, filial_id, nome, nome_normalizado) VALUES ($1, $2, $3, $4, $5)`,
            [id, lojista, filial, `Categoria ${c}`, `categoria ${c}`],
          );
        }
        await db.query(
          `INSERT INTO produtos (id, tenant_id, filial_id, categoria_id, nome, nome_normalizado, quantidade,
                                 preco_promocional_centavos, preco_original_centavos, data_inicio, data_limite)
           SELECT gen_random_uuid(), $1, $2, ($3::uuid[])[1 + (g % ${CATEGORIAS})],
                  'Produto de oferta ' || g, 'produto de oferta ' || g, '1 kg',
                  199 + g, CASE WHEN g % 2 = 0 THEN 299 + g END,
                  $4::date - 3, CASE WHEN g % 4 = 0 THEN NULL ELSE $4::date + 5 END
           FROM generate_series(1, ${PRODUTOS_POR_FILIAL}) g`,
          [lojista, filial, categorias, hoje],
        );
      }
    }
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    await db.end();
  }

  const destino = path.resolve(__dirname, '../test/carga/codigos.json');
  fs.writeFileSync(destino, JSON.stringify(codigos, null, 2));
  console.log(`${codigos.length} filiais criadas; códigos em ${destino}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
