// Configuração usada só pelo sequelize-cli (migrations e seeders). A app usa sequelize.config.ts.
const url = process.env.DATABASE_URL ?? 'postgres://tabloide:tabloide@localhost:5432/tabloide';
const ssl = process.env.DB_SSL === 'true';

const config = {
  url,
  dialect: 'postgres',
  logging: false,
  migrationStorageTableName: 'sequelize_meta',
  dialectOptions: ssl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
};

module.exports = { development: config, test: config, production: config };
