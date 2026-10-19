import type { INestApplication } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { criarAppDeController } from '../../../../test/helpers/app-de-controller';
import { AppConfig } from '../../../config/app.config';
import {
  UploadFotoInterceptor,
  UploadFotoOpcionalInterceptor,
} from '../../midia/interceptors/upload-imagem.interceptor';
import { ProdutosController } from '../controllers/produtos.controller';
import { ProdutoFotoService } from '../services/produto-foto.service';
import { ProdutosService } from '../services/produtos.service';

const F = uuidv7();
const P = uuidv7();
const C = uuidv7();

describe('Funcionalidade: ProdutosController', () => {
  const produtos = {
    criar: jest.fn(),
    listar: jest.fn(),
    obter: jest.fn(),
    editar: jest.fn(),
    excluir: jest.fn(),
  };
  const fotos = { substituir: jest.fn(), remover: jest.fn() };
  let app: INestApplication;
  let http: Awaited<ReturnType<typeof criarAppDeController>>['http'];

  beforeAll(async () => {
    ({ app, http } = await criarAppDeController({
      controllers: [ProdutosController],
      providers: [
        { provide: ProdutosService, useValue: produtos },
        { provide: ProdutoFotoService, useValue: fotos },
        UploadFotoOpcionalInterceptor,
        UploadFotoInterceptor,
        { provide: AppConfig, useValue: { maxImagemBytes: 1000 } },
      ],
    }));
  });
  beforeEach(() => {
    jest.resetAllMocks();
    for (const metodo of [...Object.values(produtos), ...Object.values(fotos)])
      metodo.mockResolvedValue({ id: P });
  });
  afterAll(() => app.close());

  const base = `/v1/painel/filiais/${F}/produtos`;
  const minimo = { nome: 'Leite', categoriaId: C, precoPromocionalCentavos: 499 };

  describe('Cenário: POST JSON sem foto', () => {
    it('Então o service recebe (T1, F, dto, undefined) e responde 201 com a view', async () => {
      const r = await http().post(base).send(minimo);
      expect(r.status).toBe(201);
      expect(r.body).toEqual({ id: P });
      expect(produtos.criar).toHaveBeenCalledWith('T1', F, minimo, undefined);
    });
  });

  describe('Cenário: POST multipart com foto', () => {
    it('Então os campos viram números e o service recebe o buffer da foto', async () => {
      const r = await http()
        .post(base)
        .field('nome', 'Arroz')
        .field('categoriaId', C)
        .field('precoPromocionalCentavos', '2199')
        .field('precoOriginalCentavos', '2649')
        .attach('foto', Buffer.from('img'), 'arroz.jpg');
      expect(r.status).toBe(201);
      expect(produtos.criar).toHaveBeenCalledWith(
        'T1',
        F,
        { nome: 'Arroz', categoriaId: C, precoPromocionalCentavos: 2199, precoOriginalCentavos: 2649 },
        Buffer.from('img'),
      );
    });
  });

  describe('Cenário: tenantId nunca vem do corpo', () => {
    it('Então 400 pelo whitelist e o service não é chamado', async () => {
      const r = await http()
        .post(base)
        .send({ ...minimo, tenantId: 'T2' });
      expect(r.status).toBe(400);
      expect(produtos.criar).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: arquivo acima do limite do Multer', () => {
    it('Então 413 IMAGEM_MUITO_GRANDE', async () => {
      const r = await http().post(base).field('nome', 'Arroz').attach('foto', Buffer.alloc(1001, 1), 'a.jpg');
      expect(r.status).toBe(413);
      expect(r.body.erro.codigo).toBe('IMAGEM_MUITO_GRANDE');
    });
  });

  describe('Cenário: PUT /foto sem arquivo', () => {
    it('Então 400 VALIDACAO_INVALIDA no campo foto', async () => {
      const r = await http().put(`${base}/${P}/foto`);
      expect(r.status).toBe(400);
      expect(r.body.erro.detalhes.campos.foto).toBeDefined();
      expect(fotos.substituir).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: PUT /foto com arquivo', () => {
    it('Então repassa o buffer', async () => {
      await http().put(`${base}/${P}/foto`).attach('foto', Buffer.from('nova'), 'b.png').expect(200);
      expect(fotos.substituir).toHaveBeenCalledWith('T1', F, P, Buffer.from('nova'));
    });
  });

  describe('Cenário: DELETE /foto', () => {
    it('Então 200 com a view', async () => {
      await http().delete(`${base}/${P}/foto`).expect(200);
      expect(fotos.remover).toHaveBeenCalledWith('T1', F, P);
    });
  });

  describe('Cenário: DELETE devolve 204', () => {
    it('Então excluir(T1, F, P) e corpo vazio', async () => {
      const r = await http().delete(`${base}/${P}`);
      expect(r.status).toBe(204);
      expect(r.text).toBe('');
      expect(produtos.excluir).toHaveBeenCalledWith('T1', F, P);
    });
  });

  describe('Cenário: PATCH devolve 200 com a view', () => {
    it('Então editar(T1, F, P, dto) com null preservado', async () => {
      await http().patch(`${base}/${P}`).send({ precoOriginalCentavos: null }).expect(200);
      expect(produtos.editar).toHaveBeenCalledWith('T1', F, P, { precoOriginalCentavos: null });
    });
  });

  describe('Cenário: GET lista repassa a query', () => {
    it('Então o service recebe a query tipada', async () => {
      await http().get(`${base}?situacao=VIGENTE&pagina=2&busca=acucar`).expect(200);
      expect(produtos.listar).toHaveBeenCalledWith(
        'T1',
        F,
        expect.objectContaining({ situacao: ['VIGENTE'], pagina: 2, porPagina: 50, busca: 'acucar' }),
      );
    });
  });

  describe('Cenário: GET detalhe', () => {
    it('Então obter(T1, F, P)', async () => {
      await http().get(`${base}/${P}`).expect(200);
      expect(produtos.obter).toHaveBeenCalledWith('T1', F, P);
    });
  });

  describe('Cenário: produtoId não UUID v7', () => {
    it('Então 404 RECURSO_NAO_ENCONTRADO', async () => {
      const r = await http().get(`${base}/abc`);
      expect(r.status).toBe(404);
      expect(r.body.erro.codigo).toBe('RECURSO_NAO_ENCONTRADO');
    });
  });
});
