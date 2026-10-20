import { Module } from '@nestjs/common';
import { CategoriasModule } from '../categorias/categorias.module';
import { MidiaModule } from '../midia/midia.module';
import { PanfletosModule } from '../panfletos/panfletos.module';
import { PublicoController } from './controllers/publico.controller';
import { PaginaPublicaCache } from './services/pagina-publica.cache';
import { PaginaPublicaQuery } from './services/pagina-publica.query';
import { PublicoService } from './services/publico.service';

/** Página pública lida pelo QR Code. Os models de panfleto, produto e categoria vêm reexportados. */
@Module({
  imports: [PanfletosModule, CategoriasModule, MidiaModule],
  controllers: [PublicoController],
  providers: [PublicoService, PaginaPublicaQuery, PaginaPublicaCache],
})
export class PublicoModule {}
