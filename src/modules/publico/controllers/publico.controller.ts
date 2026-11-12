import { Controller, Get, Headers, Param, Req, Res } from '@nestjs/common';
import {
  ApiHeader,
  ApiNotModifiedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import { ApiRespostasDeErro } from '../../../common/swagger/respostas.decorator';
import { LimitarRequisicoes } from '../../../common/throttle/limites-de-requisicao';
import { ehAcessoContavel } from '../../acessos/domain/acesso-contavel';
import { RegistroAcessosService } from '../../acessos/services/registro-acessos.service';
import { ifNoneMatchContem } from '../domain/etag';
import { PublicoService } from '../services/publico.service';
import { PaginaPublicaJson } from '../views/pagina-publica.view';

/** RNF02: o navegador reaproveita por 30 s e revalida em segundo plano por até 5 min. */
export const CACHE_CONTROL_PAGINA = 'public, max-age=30, stale-while-revalidate=300';

/** Sem autenticação (RN27). O 404 sai pelo AppExceptionFilter, com cache curto. */
@ApiTags('Página pública')
@Public()
@LimitarRequisicoes('publico')
@Controller('publico')
export class PublicoController {
  constructor(
    private readonly publico: PublicoService,
    private readonly registroAcessos: RegistroAcessosService,
  ) {}

  /** HEAD também é atendido: o Express responde HEAD nas rotas GET. */
  @Get('filiais/:codigo')
  @ApiOperation({ summary: 'Página pública da filial: panfleto vigente e produtos por categoria (RN27)' })
  @ApiParam({ name: 'codigo', description: 'Código público da filial (o mesmo do QR Code)' })
  @ApiHeader({ name: 'If-None-Match', required: false })
  @ApiQuery({
    name: 'origem',
    required: false,
    enum: ['painel'],
    description:
      'painel = o lojista vendo a própria página: o acesso não conta (RN50). Outro valor é ignorado.',
  })
  @ApiOkResponse({
    type: PaginaPublicaJson,
    headers: {
      ETag: { schema: { type: 'string' } },
      'Cache-Control': { schema: { type: 'string', example: CACHE_CONTROL_PAGINA } },
    },
  })
  @ApiNotModifiedResponse({ description: 'ETag igual ao If-None-Match' })
  @ApiRespostasDeErro(CodigoErro.RECURSO_NAO_ENCONTRADO, CodigoErro.MUITAS_TENTATIVAS)
  async obter(
    @Param('codigo') codigo: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const pagina = await this.publico.obterPagina(codigo);
    // RN50: conta 200 e 304; o 404 sai antes por exceção. A gravação nunca rejeita e tem limite de tempo (D5)
    if (
      ehAcessoContavel({ metodo: req.method, userAgent: req.get('user-agent'), origem: req.query.origem })
    ) {
      await this.registroAcessos.registrar({
        tenantId: pagina.tenantId,
        filialId: pagina.filialId,
        fuso: pagina.fuso,
      });
    }
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
