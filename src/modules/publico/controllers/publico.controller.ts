import { Controller, Get, Headers, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { LimitarRequisicoes } from '../../../common/throttle/limites-de-requisicao';
import { ifNoneMatchContem } from '../domain/etag';
import { PublicoService } from '../services/publico.service';

/** RNF02: o navegador reaproveita por 30 s e revalida em segundo plano por até 5 min. */
export const CACHE_CONTROL_PAGINA = 'public, max-age=30, stale-while-revalidate=300';

/** Sem autenticação (RN27). O 404 sai pelo AppExceptionFilter, com cache curto. */
@Public()
@LimitarRequisicoes('publico')
@Controller('publico')
export class PublicoController {
  constructor(private readonly publico: PublicoService) {}

  /** HEAD também é atendido: o Express responde HEAD nas rotas GET. */
  @Get('filiais/:codigo')
  async obter(
    @Param('codigo') codigo: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const pagina = await this.publico.obterPagina(codigo);
    res.setHeader('Cache-Control', CACHE_CONTROL_PAGINA);
    res.setHeader('ETag', pagina.etag);
    res.setHeader('Vary', 'Accept-Encoding');
    if (ifNoneMatch && ifNoneMatchContem(ifNoneMatch, pagina.etag)) {
      res.status(304).end();
      return;
    }
    res.status(200).type('application/json; charset=utf-8');
    // gzip pré-comprimido no cache: o middleware de compressão ignora respostas com Content-Encoding
    if (req.acceptsEncodings('gzip', 'identity') === 'gzip') {
      res.setHeader('Content-Encoding', 'gzip');
      res.send(pagina.corpoGzip);
      return;
    }
    res.send(pagina.corpo);
  }
}
