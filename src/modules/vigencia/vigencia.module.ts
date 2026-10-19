import { Module } from '@nestjs/common';
import { VigenciaService } from './services/vigencia.service';

/** As funções puras de domain/ são importadas direto; só o "hoje da filial" precisa de injeção. */
@Module({ providers: [VigenciaService], exports: [VigenciaService] })
export class VigenciaModule {}
