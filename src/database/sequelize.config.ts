import type { SequelizeModuleOptions } from '@nestjs/sequelize';
import type { Env } from '../config/env.schema';

export function opcoesSequelize(
  env: Pick<Env, 'NODE_ENV' | 'DATABASE_URL' | 'DB_POOL_MAX' | 'DB_SSL'>,
  log?: (sql: string) => void,
): SequelizeModuleOptions {
  return {
    dialect: 'postgres',
    uri: env.DATABASE_URL,
    logging: env.NODE_ENV === 'development' && log ? log : false,
    pool: { max: env.DB_POOL_MAX, min: 0, idle: 10_000, acquire: 30_000 },
    // underscored mapeia createdAt -> created_at etc.
    define: { underscored: true, timestamps: true },
    dialectOptions: env.DB_SSL ? { ssl: { require: true, rejectUnauthorized: false } } : {},
    autoLoadModels: true,
    synchronize: false,
  };
}
