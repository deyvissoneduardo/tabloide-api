import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../../config/env.schema';
import { LojistasModule } from '../lojistas/lojistas.module';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';

@Global()
@Module({
  imports: [
    LojistasModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [JwtModule, LojistasModule],
})
export class AuthModule {}
