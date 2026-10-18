import { Module } from '@nestjs/common';
import { AdminKeyGuard } from '../../common/guards/admin-key.guard';
import { LojistasModule } from '../lojistas/lojistas.module';
import { AdminLojistasController } from './controllers/admin-lojistas.controller';

@Module({
  imports: [LojistasModule],
  controllers: [AdminLojistasController],
  providers: [AdminKeyGuard],
})
export class AdminModule {}
