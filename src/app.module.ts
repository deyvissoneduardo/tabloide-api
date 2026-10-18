import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { ClockModule } from './common/clock/clock.module';
import { AppExceptionFilter } from './common/errors/app-exception.filter';
import { errosDeValidacaoParaAppError } from './common/errors/validacao';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantStatusGuard } from './common/guards/tenant-status.guard';
import { TenantModule } from './common/tenant/tenant.module';
import { limitesDeRequisicao } from './common/throttle/limites-de-requisicao';
import { validarEnv, type Env } from './config/env.schema';
import { opcoesDoLogger } from './config/logger.config';
import { DatabaseModule } from './database/database.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { LojistasModule } from './modules/lojistas/lojistas.module';

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
    ClockModule,
    TenantModule,
    DatabaseModule,
    AuthModule,
    LojistasModule,
    AdminModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
        exceptionFactory: errosDeValidacaoParaAppError,
      }),
    },
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantStatusGuard },
  ],
})
export class AppModule {}
