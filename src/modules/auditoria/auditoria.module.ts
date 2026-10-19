import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuditoriaController } from './controllers/auditoria.controller';
import { AuditoriaAlteracao } from './models/auditoria-alteracao.model';
import { AuditoriaService } from './services/auditoria.service';

@Module({
  imports: [SequelizeModule.forFeature([AuditoriaAlteracao])],
  controllers: [AuditoriaController],
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
