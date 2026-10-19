import type { INestApplication } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { criarAppDeController } from '../../../../test/helpers/app-de-controller';
import { CategoriasController } from '../controllers/categorias.controller';
import { CategoriasService } from '../services/categorias.service';

const F = uuidv7();
const C = uuidv7();

describe('Funcionalidade: CategoriasController', () => {
  const categorias = { listar: jest.fn(), criar: jest.fn(), renomear: jest.fn(), excluir: jest.fn() };
  let app: INestApplication;
  let http: Awaited<ReturnType<typeof criarAppDeController>>['http'];

  beforeAll(async () => {
    ({ app, http } = await criarAppDeController({
      controllers: [CategoriasController],
      providers: [{ provide: CategoriasService, useValue: categorias }],
    }));
  });
  beforeEach(() => {
    jest.resetAllMocks();
    for (const metodo of Object.values(categorias)) metodo.mockResolvedValue({ id: C });
  });
  afterAll(() => app.close());

  const base = `/v1/painel/filiais/${F}/categorias`;

  describe('Cenário: GET lista embrulhada em itens', () => {
    it('Então { itens: [...] }', async () => {
      categorias.listar.mockResolvedValue([{ id: C }]);
      const r = await http().get(base).expect(200);
      expect(r.body).toEqual({ itens: [{ id: C }] });
      expect(categorias.listar).toHaveBeenCalledWith('T1', F);
    });
  });

  describe('Cenário: POST devolve 201', () => {
    it('Então criar(T1, F, dto) com o nome aparado', async () => {
      await http().post(base).send({ nome: '  Mercearia  ' }).expect(201);
      expect(categorias.criar).toHaveBeenCalledWith('T1', F, { nome: 'Mercearia' });
    });
  });

  describe('Cenário: PATCH renomeia', () => {
    it('Então renomear(T1, F, C, dto)', async () => {
      await http().patch(`${base}/${C}`).send({ nome: 'Bebidas' }).expect(200);
      expect(categorias.renomear).toHaveBeenCalledWith('T1', F, C, { nome: 'Bebidas' });
    });
  });

  describe('Cenário: DELETE devolve 204', () => {
    it('Então excluir(T1, F, C)', async () => {
      await http().delete(`${base}/${C}`).expect(204);
      expect(categorias.excluir).toHaveBeenCalledWith('T1', F, C);
    });
  });

  describe('Cenário: UUID inválido no path', () => {
    it('Então 404 RECURSO_NAO_ENCONTRADO', async () => {
      const r = await http().get('/v1/painel/filiais/abc/categorias');
      expect(r.status).toBe(404);
      expect(r.body.erro.codigo).toBe('RECURSO_NAO_ENCONTRADO');
      expect(categorias.listar).not.toHaveBeenCalled();
    });
  });
});
