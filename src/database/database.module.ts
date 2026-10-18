import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import type { Env } from '../config/env.schema';
import { opcoesSequelize } from './sequelize.config';
import { registrarHooksDeTenant } from './tenant-scope.hooks';

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const logger = new Logger('SQL');
        return opcoesSequelize(
          {
            NODE_ENV: config.get('NODE_ENV', { infer: true }),
            DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
            DB_POOL_MAX: config.get('DB_POOL_MAX', { infer: true }),
            DB_SSL: config.get('DB_SSL', { infer: true }),
          },
          (sql) => logger.debug(sql),
        );
      },
    }),
  ],
})
export class DatabaseModule implements OnModuleInit {
  constructor(private readonly sequelize: Sequelize) {}

  onModuleInit(): void {
    registrarHooksDeTenant(this.sequelize);
  }
}
