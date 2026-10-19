import {
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
  type INestApplication,
} from '@nestjs/common';
import { criarAppDeController } from '../../../../test/helpers/app-de-controller';
import { AppConfig } from '../../../config/app.config';
import { UploadImagemInterceptor } from '../interceptors/upload-imagem.interceptor';

@Controller('upload-teste')
class UploadTesteController {
  @Post()
  @HttpCode(200)
  @UseInterceptors(UploadImagemInterceptor)
  receber(@UploadedFile() arquivo: Express.Multer.File) {
    return { bytes: arquivo.size };
  }
}

describe('Funcionalidade: Receber arquivo multipart', () => {
  let app: INestApplication;
  let http: Awaited<ReturnType<typeof criarAppDeController>>['http'];

  beforeAll(async () => {
    ({ app, http } = await criarAppDeController({
      controllers: [UploadTesteController],
      providers: [UploadImagemInterceptor, { provide: AppConfig, useValue: { maxImagemBytes: 1000 } }],
    }));
  });
  afterAll(() => app.close());

  const post = () => http().post('/v1/upload-teste');

  describe('Cenário: arquivo dentro do limite', () => {
    it('Então chega ao handler em memória', async () => {
      const r = await post().attach('imagem', Buffer.alloc(500, 1), 'a.jpg');
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ bytes: 500 });
    });
  });

  describe('Cenário: arquivo acima do limite', () => {
    it('Então 413 IMAGEM_MUITO_GRANDE com maxBytes', async () => {
      const r = await post().attach('imagem', Buffer.alloc(1001, 1), 'a.jpg');
      expect(r.status).toBe(413);
      expect(r.body.erro).toMatchObject({ codigo: 'IMAGEM_MUITO_GRANDE', detalhes: { maxBytes: 1000 } });
    });
  });

  describe('Cenário: dois arquivos', () => {
    it('Então 400 VALIDACAO_INVALIDA no campo imagem', async () => {
      const r = await post()
        .attach('imagem', Buffer.alloc(10), 'a.jpg')
        .attach('imagem', Buffer.alloc(10), 'b.jpg');
      expect(r.status).toBe(400);
      expect(r.body.erro.detalhes.campos.imagem).toBeDefined();
    });
  });

  describe('Cenário: campo de arquivo com outro nome', () => {
    it('Então 400 VALIDACAO_INVALIDA', async () => {
      const r = await post().attach('foto', Buffer.alloc(10), 'a.jpg');
      expect(r.status).toBe(400);
      expect(r.body.erro.codigo).toBe('VALIDACAO_INVALIDA');
    });
  });

  describe('Cenário: arquivo ausente', () => {
    it('Então 400 pedindo a imagem', async () => {
      const r = await post().field('dataLimite', '2026-10-31');
      expect(r.status).toBe(400);
      expect(r.body.erro.detalhes.campos.imagem).toEqual(['Envie a imagem no campo "imagem".']);
    });
  });
});
