import type { INestApplication } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { criarAppDeController } from '../../../../test/helpers/app-de-controller';
import { naoEncontrado } from '../../../common/errors/errors';
import { AppConfig } from '../../../config/app.config';
import { FiliaisController } from '../controllers/filiais.controller';
import { FiliaisService } from '../services/filiais.service';
import { QrCodeService } from '../services/qrcode.service';

const ID = uuidv7();
const filial = {
  id: ID,
  tenantId: 'T1',
  nome: 'Centro',
  endereco: 'Rua A',
  fusoHorario: 'America/Sao_Paulo',
  codigoPublico: 'k7Qm2xPa',
  createdAt: new Date('2026-10-18T15:00:00Z'),
  updatedAt: new Date('2026-10-18T15:00:00Z'),
  deletedAt: null,
};

describe('Funcionalidade: Rotas de filiais', () => {
  const filiais = {
    listar: jest.fn(),
    obter: jest.fn(),
    criar: jest.fn(),
    editar: jest.fn(),
    excluir: jest.fn(),
  };
  const qrCode = { etag: jest.fn(), gerar: jest.fn() };
  let app: INestApplication;
  let http: Awaited<ReturnType<typeof criarAppDeController>>['http'];

  beforeAll(async () => {
    ({ app, http } = await criarAppDeController({
      controllers: [FiliaisController],
      providers: [
        { provide: FiliaisService, useValue: filiais },
        { provide: QrCodeService, useValue: qrCode },
        { provide: AppConfig, useValue: { publicBaseUrl: 'https://tabloide.app' } },
      ],
    }));
  });
  beforeEach(() => {
    jest.resetAllMocks();
    filiais.criar.mockResolvedValue(filial);
    filiais.obter.mockResolvedValue(filial);
    filiais.editar.mockResolvedValue(filial);
    qrCode.etag.mockReturnValue('W/"abc"');
    qrCode.gerar.mockResolvedValue({ conteudo: Buffer.from('png'), contentType: 'image/png' });
  });
  afterAll(() => app.close());

  const esperaValidacao = async (resposta: { status: number; body: { erro: { codigo: string } } }) => {
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('VALIDACAO_INVALIDA');
  };

  describe('Cenário: POST cria e devolve 201 com Location', () => {
    it('Então o service recebe os dados normalizados e a view não expõe tenantId', async () => {
      const resposta = await http()
        .post('/v1/painel/filiais')
        .send({ nome: '  Centro  ', endereco: 'Rua A' });
      expect(resposta.status).toBe(201);
      expect(filiais.criar).toHaveBeenCalledWith('T1', { nome: 'Centro', endereco: 'Rua A' });
      expect(resposta.headers.location).toBe(`/v1/painel/filiais/${ID}`);
      expect(resposta.body).toEqual({
        id: ID,
        nome: 'Centro',
        endereco: 'Rua A',
        fusoHorario: 'America/Sao_Paulo',
        codigoPublico: 'k7Qm2xPa',
        urlPublica: 'https://tabloide.app/f/k7Qm2xPa',
        criadaEm: '2026-10-18T15:00:00.000Z',
        atualizadaEm: '2026-10-18T15:00:00.000Z',
      });
    });
  });

  describe('Cenário: POST sem nome', () => {
    it('Então 400 com detalhe em nome', async () => {
      const resposta = await http().post('/v1/painel/filiais').send({ endereco: 'Rua A' });
      await esperaValidacao(resposta);
      expect(resposta.body.erro.detalhes.campos.nome).toBeDefined();
    });
  });

  describe.each([
    ['nome só de espaços', { nome: '   ', endereco: 'Rua A' }],
    ['nome com 121 caracteres', { nome: 'x'.repeat(121), endereco: 'Rua A' }],
    ['endereço com 301 caracteres', { nome: 'C', endereco: 'x'.repeat(301) }],
    ['codigoPublico no corpo', { nome: 'C', endereco: 'R', codigoPublico: 'AAAAAAAA' }],
    ['tenantId no corpo', { nome: 'C', endereco: 'R', tenantId: 'T2' }],
    ['fuso com mais de 64 caracteres', { nome: 'C', endereco: 'R', fusoHorario: 'x'.repeat(65) }],
  ])('Cenário: POST com %s', (_nome, corpo) => {
    it('Então 400 e o service não é chamado', async () => {
      await esperaValidacao(await http().post('/v1/painel/filiais').send(corpo));
      expect(filiais.criar).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: PATCH com corpo vazio', () => {
    it('Então 400 "Informe ao menos um campo."', async () => {
      const resposta = await http().patch(`/v1/painel/filiais/${ID}`).send({});
      await esperaValidacao(resposta);
      expect(resposta.body.erro.detalhes.campos.corpo).toEqual(['Informe ao menos um campo.']);
    });
  });

  describe('Cenário: PATCH com codigoPublico', () => {
    it('Então 400 (código imutável, RN39)', async () => {
      await esperaValidacao(
        await http().patch(`/v1/painel/filiais/${ID}`).send({ codigoPublico: 'AAAAAAAA' }),
      );
      expect(filiais.editar).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: PATCH válido', () => {
    it('Então o service recebe (tenant, id, dto) e devolve a view', async () => {
      const resposta = await http().patch(`/v1/painel/filiais/${ID}`).send({ fusoHorario: 'America/Manaus' });
      expect(resposta.status).toBe(200);
      expect(filiais.editar).toHaveBeenCalledWith('T1', ID, { fusoHorario: 'America/Manaus' });
    });
  });

  describe('Cenário: id que não é UUID', () => {
    it.each(['abc', '123e4567-e89b-12d3-a456-426614174000'])(
      'Então "%s" dá 404 sem chamar o service',
      async (id) => {
        const resposta = await http().get(`/v1/painel/filiais/${id}`);
        expect(resposta.status).toBe(404);
        expect(resposta.body.erro.codigo).toBe('RECURSO_NAO_ENCONTRADO');
        expect(filiais.obter).not.toHaveBeenCalled();
      },
    );
  });

  describe('Cenário: GET por id', () => {
    it('Então devolve a view', async () => {
      const resposta = await http().get(`/v1/painel/filiais/${ID}`);
      expect(resposta.status).toBe(200);
      expect(filiais.obter).toHaveBeenCalledWith('T1', ID);
      expect(resposta.body.urlPublica).toBe('https://tabloide.app/f/k7Qm2xPa');
    });
  });

  describe('Cenário: DELETE devolve 204', () => {
    it('Então chama excluir(tenant, id) e responde sem corpo', async () => {
      const resposta = await http().delete(`/v1/painel/filiais/${ID}`);
      expect(resposta.status).toBe(204);
      expect(resposta.text).toBe('');
      expect(filiais.excluir).toHaveBeenCalledWith('T1', ID);
    });
  });

  describe('Cenário: GET lista com paginação padrão', () => {
    it('Então o service recebe pagina 1 e porPagina 50', async () => {
      filiais.listar.mockResolvedValue({ itens: [filial], total: 1 });
      const resposta = await http().get('/v1/painel/filiais');
      expect(filiais.listar).toHaveBeenCalledWith('T1', { pagina: 1, porPagina: 50 });
      expect(resposta.body).toMatchObject({ total: 1, pagina: 1, porPagina: 50 });
      expect(resposta.body.itens).toHaveLength(1);
    });

    it('E converte a paginação da query', async () => {
      filiais.listar.mockResolvedValue({ itens: [], total: 0 });
      await http().get('/v1/painel/filiais?pagina=3&porPagina=20').expect(200);
      expect(filiais.listar).toHaveBeenCalledWith('T1', { pagina: 3, porPagina: 20 });
    });
  });

  describe('Funcionalidade: QR Code', () => {
    describe('Cenário: ETag igual devolve 304 sem gerar', () => {
      it('Então 304 e QrCodeService.gerar não é chamado', async () => {
        const resposta = await http().get(`/v1/painel/filiais/${ID}/qrcode`).set('If-None-Match', 'W/"abc"');
        expect(resposta.status).toBe(304);
        expect(qrCode.gerar).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: PNG para download', () => {
      it('Então headers de tipo, anexo e cache', async () => {
        const resposta = await http().get(
          `/v1/painel/filiais/${ID}/qrcode?formato=png&tamanho=1024&download=1`,
        );
        expect(resposta.status).toBe(200);
        expect(qrCode.gerar).toHaveBeenCalledWith('k7Qm2xPa', 'png', 1024);
        expect(resposta.headers['content-type']).toContain('image/png');
        expect(resposta.headers['content-disposition']).toBe('attachment; filename="qrcode-k7Qm2xPa.png"');
        expect(resposta.headers['cache-control']).toBe('private, max-age=86400');
        expect(resposta.headers.etag).toBe('W/"abc"');
      });
    });

    describe('Cenário: SVG padrão exibido inline', () => {
      it('Então formato svg, tamanho 512 e inline', async () => {
        qrCode.gerar.mockResolvedValue({ conteudo: '<svg/>', contentType: 'image/svg+xml' });
        const resposta = await http().get(`/v1/painel/filiais/${ID}/qrcode`);
        expect(qrCode.etag).toHaveBeenCalledWith('k7Qm2xPa', 'svg', 512);
        expect(resposta.headers['content-disposition']).toBe('inline');
        expect(resposta.headers['content-type']).toContain('image/svg+xml');
      });
    });

    describe('Cenário: filial de outro tenant', () => {
      it('Então 404 e nem etag nem gerar são chamados', async () => {
        filiais.obter.mockRejectedValue(naoEncontrado());
        const resposta = await http().get(`/v1/painel/filiais/${ID}/qrcode`);
        expect(resposta.status).toBe(404);
        expect(qrCode.etag).not.toHaveBeenCalled();
        expect(qrCode.gerar).not.toHaveBeenCalled();
      });
    });

    describe.each([
      ['formato inválido', 'formato=jpg'],
      ['tamanho acima do máximo', 'tamanho=4096'],
      ['tamanho abaixo do mínimo', 'tamanho=64'],
      ['download inválido', 'download=sim'],
    ])('Cenário: %s', (_nome, query) => {
      it('Então 400', async () =>
        esperaValidacao(await http().get(`/v1/painel/filiais/${ID}/qrcode?${query}`)));
    });
  });
});
