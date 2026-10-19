import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';

const PASTA_MIGRATIONS = path.resolve(__dirname, '../../src/database/migrations');

/** Tabelas limpas entre testes. Cresce nas fases seguintes. */
export const TABELAS = [
  'produtos',
  'categorias',
  'panfletos',
  'auditoria_alteracoes',
  'filiais',
  'lojista_ativacoes',
  'lojistas',
];

export interface BancoDeTeste {
  container: StartedPostgreSqlContainer;
  url: string;
  sequelize: Sequelize;
  migrador: Umzug<ReturnType<Sequelize['getQueryInterface']>>;
}

export function criarMigrador(sequelize: Sequelize) {
  return new Umzug({
    migrations: {
      glob: ['*.js', { cwd: PASTA_MIGRATIONS }],
      resolve: ({ name, path: arquivo, context }) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const migration = require(arquivo!);
        return {
          name,
          up: () => migration.up(context, Sequelize),
          down: () => migration.down(context, Sequelize),
        };
      },
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize, tableName: 'sequelize_meta' }),
    logger: undefined,
  });
}

/** Sobe um Postgres 16 descartável e aplica as migrations reais. Um por arquivo de teste. */
export async function iniciarBanco(): Promise<BancoDeTeste> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  const sequelize = new Sequelize(url, { logging: false });
  const migrador = criarMigrador(sequelize);
  await migrador.up();
  return { container, url, sequelize, migrador };
}

export async function limparBanco(banco: BancoDeTeste): Promise<void> {
  await banco.sequelize.query(`TRUNCATE ${TABELAS.join(', ')} RESTART IDENTITY CASCADE`);
}

export async function encerrarBanco(banco: BancoDeTeste | undefined): Promise<void> {
  await banco?.sequelize.close();
  await banco?.container.stop();
}
