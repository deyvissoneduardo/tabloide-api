import type { INestApplication } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { criarAppDeController } from '../../../../test/helpers/app-de-controller';
import { AppConfig } from '../../../config/app.config';
import { UploadImagemInterceptor } from '../../midia/interceptors/upload-imagem.interceptor';
import { PanfletosController } from '../controllers/panfletos.controller';
import { PanfletosService } from '../services/panfletos.service';

const F = uuidv7();
const P = uuidv7();

describe('Funcionalidade: PanfletosController', () => {
  const panfletos = {
    criar: jest.fn(),
    listar: jest.fn(),
    detalhar: jest.fn(),
    editarDatas: jest.fn(),
    trocarImagem: jest.fn(),
    excluir: jest.fn(),
  };
  let app: INestApplication;
  let http: Awaited<ReturnType<typeof criarAppDeController>>['http'];

  beforeAll(async () => {
    ({ app, http } = await criarAppDeController({
      controllers: [PanfletosController],
      providers: [
        { provide: PanfletosService, useValue: panfletos },
        UploadImagemInterceptor,
        { provide: AppConfig, useValue: { maxImagemBytes: 1_000_000 } },
      ],
    }));
  });
  beforeEach(() => {
    jest.resetAllMocks();
    for (const metodo of Object.values(panfletos)) metodo.mockResolvedValue({ id: P });
  });
  afterAll(() => app.close());

  const base = `/v1/painel/filiais/${F}/panfletos`;

  describe('Cenário: criar repassa tenant do token, filial do path, dto e buffer', () => {
    it('Então service.criar recebe (t1, f1, dto, buffer) e responde 201', async () => {
      const r = await http()
        .post(base)
        .field('dataLimite', '2026-10-31')
        .attach('imagem', Buffer.from('img'), 'a.jpg');
      expect(r.status).toBe(201);
      expect(panfletos.criar).toHaveBeenCalledWith('T1', F, { dataLimite: '2026-10-31' }, Buffer.from('img'));
    });
  });

  describe('Cenário: criar com campo extra no multipart', () => {
    it('Então 400 e o service não é chamado', async () => {
      const r = await http().post(base).field('tenantId', 't2').attach('imagem', Buffer.from('img'), 'a.jpg');
      expect(r.status).toBe(400);
      expect(panfletos.criar).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: filialId não UUID', () => {
    it('Então 404 RECURSO_NAO_ENCONTRADO', async () => {
      const r = await http().get('/v1/painel/filiais/abc/panfletos');
      expect(r.status).toBe(404);
      expect(panfletos.listar).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: listar com filtro e paginação', () => {
    it('Então o service recebe a query convertida', async () => {
      await http().get(`${base}?situacao=VIGENTE,AGENDADO&pagina=2`).expect(200);
      expect(panfletos.listar).toHaveBeenCalledWith(
        'T1',
        F,
        expect.objectContaining({ situacao: ['VIGENTE', 'AGENDADO'], pagina: 2, porPagina: 50 }),
      );
    });
  });

  describe('Cenário: detalhar', () => {
    it('Então repassa tenant, filial e id', async () => {
      await http().get(`${base}/${P}`).expect(200);
      expect(panfletos.detalhar).toHaveBeenCalledWith('T1', F, P);
    });
  });

  describe('Cenário: editar datas', () => {
    it('Então repassa o DTO com dataLimite null', async () => {
      await http().patch(`${base}/${P}`).send({ dataLimite: null }).expect(200);
      expect(panfletos.editarDatas).toHaveBeenCalledWith('T1', F, P, { dataLimite: null });
    });
  });

  describe('Cenário: trocar imagem', () => {
    it('Então repassa o buffer', async () => {
      await http().put(`${base}/${P}/imagem`).attach('imagem', Buffer.from('nova'), 'b.png').expect(200);
      expect(panfletos.trocarImagem).toHaveBeenCalledWith('T1', F, P, Buffer.from('nova'));
    });
  });

  describe('Cenário: excluir responde 204 sem corpo', () => {
    it('Então 204', async () => {
      const r = await http().delete(`${base}/${P}`);
      expect(r.status).toBe(204);
      expect(r.text).toBe('');
      expect(panfletos.excluir).toHaveBeenCalledWith('T1', F, P);
    });
  });
});
