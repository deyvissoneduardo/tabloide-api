import { imagens } from '../../../../test/helpers/imagens';
import { pdfs } from '../../../../test/helpers/pdfs';
import { AppError } from '../../../common/errors/app.error';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import type { VerificadorLimites } from '../../../common/limites/verificador-limites';
import type { AppConfig } from '../../../config/app.config';
import { montarCaminho } from '../domain/caminho-midia';
import type { ImagemProcessada } from '../domain/imagem-processada';
import type { ImageProcessor } from '../services/image-processor.service';
import type { PdfProcessor } from '../services/pdf-processor.service';
import { MidiaService } from '../services/midia.service';
import type { StoragePort } from '../storage/storage.port';

describe('Funcionalidade: Caminho imutável de mídia', () => {
  describe('Cenário: formato do caminho', () => {
    it('Então tenant/perfil/uuid.webp', () =>
      expect(montarCaminho('t1', 'panfleto')).toMatch(/^t1\/panfleto\/[0-9a-f-]{36}\.webp$/));
  });

  describe('Cenário: caminhos nunca se repetem', () => {
    it('Então 1000 caminhos distintos', () =>
      expect(new Set(Array.from({ length: 1000 }, () => montarCaminho('t1', 'logo'))).size).toBe(1000));
  });

  describe('Cenário: caminho de PDF (RN13)', () => {
    it('Então tenant/panfleto/uuid.pdf', () =>
      expect(montarCaminho('t1', 'panfleto', 'pdf')).toMatch(/^t1\/panfleto\/[0-9a-f-]{36}\.pdf$/));
  });
});

describe('Funcionalidade: MidiaService', () => {
  const processor = { processar: jest.fn() };
  const storage = { salvar: jest.fn(), urlPublica: jest.fn((c: string) => `https://cdn/${c}`) };
  const limites = { maxImagemBytes: jest.fn() };
  const pdf = { processar: jest.fn() };
  const config = { maxPdfBytes: 2 * 1024 * 1024 };
  const service = new MidiaService(
    processor as unknown as ImageProcessor,
    storage as StoragePort,
    limites as unknown as VerificadorLimites,
    pdf as unknown as PdfProcessor,
    config as AppConfig,
  );
  const imagem: ImagemProcessada = {
    conteudo: Buffer.from('w'),
    largura: 1,
    altura: 1,
    contentType: 'image/webp',
    bytes: 1,
  };

  beforeEach(() => jest.clearAllMocks());

  describe('Cenário: salvar delega ao StoragePort e devolve o caminho', () => {
    it('Então salva no caminho do tenant e perfil e devolve o mesmo caminho', async () => {
      const caminho = await service.salvar('t1', 'logo', imagem);
      expect(caminho).toMatch(/^t1\/logo\/.+\.webp$/);
      expect(storage.salvar).toHaveBeenCalledWith(imagem.conteudo, caminho, 'image/webp');
    });
  });

  describe('Cenário: URL pública', () => {
    it('Então delega ao storage, e null para caminho nulo', () => {
      expect(service.urlPublica('a.webp')).toBe('https://cdn/a.webp');
      expect(service.urlPublica(null)).toBeNull();
    });
  });

  describe('Cenário: imagem acima do limite do lojista (RNF12)', () => {
    it('Então IMAGEM_MUITO_GRANDE com maxBytes e o processador não é chamado', async () => {
      limites.maxImagemBytes.mockResolvedValue(2_000_000);
      await expect(service.processar('t1', Buffer.alloc(2_500_000), 'panfleto')).rejects.toMatchObject({
        codigo: CodigoErro.IMAGEM_MUITO_GRANDE,
        detalhes: { maxBytes: 2_000_000 },
      });
      expect(limites.maxImagemBytes).toHaveBeenCalledWith('t1');
      expect(processor.processar).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: imagem dentro do limite do lojista', () => {
    it('Então o processador recebe o buffer e o perfil', async () => {
      limites.maxImagemBytes.mockResolvedValue(2_000_000);
      processor.processar.mockResolvedValue(imagem);
      const buffer = Buffer.alloc(1_500_000);
      await expect(service.processar('t1', buffer, 'panfleto')).resolves.toBe(imagem);
      expect(processor.processar).toHaveBeenCalledWith(buffer, 'panfleto');
    });
  });

  describe('Funcionalidade: Panfleto aceita imagem ou PDF (RN13)', () => {
    const DOIS_MB = 2 * 1024 * 1024;

    describe('Cenário: JPEG segue o caminho de imagem', () => {
      it('Então ImageProcessor com perfil panfleto e o PdfProcessor não é chamado', async () => {
        limites.maxImagemBytes.mockResolvedValue(10_000_000);
        processor.processar.mockResolvedValue(imagem);
        const jpeg = await imagens.jpeg(10, 10);
        await expect(service.processarPanfleto('t1', jpeg)).resolves.toBe(imagem);
        expect(processor.processar).toHaveBeenCalledWith(jpeg, 'panfleto');
        expect(pdf.processar).not.toHaveBeenCalled();
      });
    });

    describe.each([
      ['plano sem limite menor', 10_000_000, DOIS_MB],
      ['plano de 1 MB', 1_000_000, 1_000_000],
    ])('Cenário: PDF com %s', (_nome, limitePlano, esperado) => {
      it(`Então PdfProcessor com maxBytes ${esperado}`, async () => {
        limites.maxImagemBytes.mockResolvedValue(limitePlano);
        const entrada = await pdfs.umaPagina();
        await service.processarPanfleto('t1', entrada);
        expect(pdf.processar).toHaveBeenCalledWith(entrada, esperado);
        expect(processor.processar).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: GIF', () => {
      it('Então IMAGEM_INVALIDA com tiposAceitos incluindo application/pdf', async () => {
        limites.maxImagemBytes.mockResolvedValue(10_000_000);
        processor.processar.mockRejectedValue(new AppError(CodigoErro.IMAGEM_INVALIDA));
        await expect(service.processarPanfleto('t1', Buffer.from('GIF89a'))).rejects.toMatchObject({
          codigo: CodigoErro.IMAGEM_INVALIDA,
          detalhes: { tiposAceitos: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
        });
      });
    });

    describe('Cenário: outro erro da imagem sobe sem mudança', () => {
      it('Então IMAGEM_MUITO_GRANDE continua igual', async () => {
        limites.maxImagemBytes.mockResolvedValue(1);
        await expect(service.processarPanfleto('t1', Buffer.alloc(10))).rejects.toMatchObject({
          codigo: CodigoErro.IMAGEM_MUITO_GRANDE,
        });
      });
    });

    describe('Cenário: salvar PDF', () => {
      it('Então grava <tenant>/panfleto/<uuid>.pdf com contentType application/pdf', async () => {
        const conteudo = await pdfs.umaPagina();
        const caminho = await service.salvar('t1', 'panfleto', {
          conteudo,
          largura: 595,
          altura: 842,
          contentType: 'application/pdf',
          bytes: conteudo.length,
        });
        expect(caminho).toMatch(/^t1\/panfleto\/.+\.pdf$/);
        expect(storage.salvar).toHaveBeenCalledWith(conteudo, caminho, 'application/pdf');
      });
    });
  });
});
