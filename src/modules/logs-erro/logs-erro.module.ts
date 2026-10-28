import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { LogErro } from './models/log-erro.model';
import { LogsErroService } from './services/logs-erro.service';

@Module({
  imports: [SequelizeModule.forFeature([LogErro])],
  providers: [LogsErroService],
  exports: [LogsErroService],
})
export class LogsErroModule {}
