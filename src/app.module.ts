import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { ClockModule } from './common/clock/clock.module';
import { AppExceptionFilter } from './common/errors/app-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantStatusGuard } from './common/guards/tenant-status.guard';
import { criarValidationPipe } from './common/pipes/validation.pipe';
import { LimitesModule } from './common/limites/limites.module';
import { TenantModule } from './common/tenant/tenant.module';
import { limitesDeRequisicao } from './common/throttle/limites-de-requisicao';
import { AppConfigModule } from './config/app-config.module';
import { validarEnv, type Env } from './config/env.schema';
import { opcoesDoLogger } from './config/logger.config';
import { DatabaseModule } from './database/database.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriasModule } from './modules/categorias/categorias.module';
import { FiliaisModule } from './modules/filiais/filiais.module';
import { LojistasModule } from './modules/lojistas/lojistas.module';
import { MidiaLocalModule } from './modules/midia/midia-local.module';
import { PanfletosModule } from './modules/panfletos/panfletos.module';
import { ProdutosModule } from './modules/produtos/produtos.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validarEnv, cache: true }),
    LoggerModule.forRootAsync({ inject: [ConfigService], useFactory: opcoesDoLogger }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true, generateId: true, idGenerator: (req) => String(req.id ?? uuidv7()) },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: limitesDeRequisicao({
          LOGIN_RATE_LIMIT: config.get('LOGIN_RATE_LIMIT', { infer: true }),
          LOGIN_RATE_TTL_SECONDS: config.get('LOGIN_RATE_TTL_SECONDS', { infer: true }),
        }),
      }),
    }),
    EventEmitterModule.forRoot(),
    AppConfigModule,
    ClockModule,
    TenantModule,
    LimitesModule,
    DatabaseModule,
    AuthModule,
    LojistasModule,
    AdminModule,
    AuditoriaModule,
    FiliaisModule,
    PanfletosModule,
    CategoriasModule,
    ProdutosModule,
    MidiaLocalModule,
  ],
  providers: [
    { provide: APP_PIPE, useFactory: criarValidationPipe },
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantStatusGuard },
  ],
})
export class AppModule {}
