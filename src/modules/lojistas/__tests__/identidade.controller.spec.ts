import type { INestApplication } from '@nestjs/common';
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { criarAppDeController } from '../../../../test/helpers/app-de-controller';
import { AppConfig } from '../../../config/app.config';
import { UploadImagemInterceptor } from '../../midia/interceptors/upload-imagem.interceptor';
import { IdentidadeController } from '../controllers/identidade.controller';
import { IdentidadeService } from '../services/identidade.service';

describe('Funcionalidade: IdentidadeController', () => {
  const identidade = { obter: jest.fn(), editar: jest.fn(), trocarLogo: jest.fn() };
  let app: INestApplication;
  let http: Awaited<ReturnType<typeof criarAppDeController>>['http'];

  beforeAll(async () => {
    ({ app, http } = await criarAppDeController({
      controllers: [IdentidadeController],
      providers: [
        { provide: IdentidadeService, useValue: identidade },
        UploadImagemInterceptor,
        { provide: AppConfig, useValue: { maxImagemBytes: 1_000_000 } },
      ],
    }));
  });
  beforeEach(() => {
    jest.resetAllMocks();
    for (const metodo of Object.values(identidade)) metodo.mockResolvedValue({ nomeFantasia: 'M' });
  });
  afterAll(() => app.close());

  describe('Cenário: GET usa o tenant do token', () => {
    it('Então obter(T1)', async () => {
      await http().get('/v1/painel/lojista/identidade').expect(200);
      expect(identidade.obter).toHaveBeenCalledWith('T1');
    });
  });

  describe('Cenário: PATCH usa tenant do token', () => {
    it('Então editar(T1, dto) com a cor normalizada', async () => {
      await http().patch('/v1/painel/lojista/identidade').send({ corPrimaria: '#c8102e' }).expect(200);
      expect(identidade.editar).toHaveBeenCalledWith('T1', { corPrimaria: '#C8102E' });
    });
  });

  describe('Cenário: PATCH com cor inválida', () => {
    it('Então 400 sem chamar o service', async () => {
      await http().patch('/v1/painel/lojista/identidade').send({ corPrimaria: 'red' }).expect(400);
      expect(identidade.editar).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: PUT logo usa o interceptor de upload', () => {
    it('Então o handler tem o UploadImagemInterceptor e repassa o buffer', async () => {
      expect(Reflect.getMetadata(INTERCEPTORS_METADATA, IdentidadeController.prototype.trocarLogo)).toContain(
        UploadImagemInterceptor,
      );
      await http().put('/v1/painel/lojista/logo').attach('imagem', Buffer.from('png'), 'l.png').expect(200);
      expect(identidade.trocarLogo).toHaveBeenCalledWith('T1', Buffer.from('png'));
    });
  });
});
