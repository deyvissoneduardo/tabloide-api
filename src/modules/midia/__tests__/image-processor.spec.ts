import sharp from 'sharp';
import { imagens } from '../../../../test/helpers/imagens';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import type { AppConfig } from '../../../config/app.config';
import type { ImagemProcessada } from '../domain/imagem-processada';
import type { PerfilImagem } from '../domain/perfis-imagem';
import { ImageProcessor } from '../services/image-processor.service';

const configPadrao = { maxImagemBytes: 10 * 1024 * 1024, imagemMaxPixels: 50_000_000, imagemConcorrencia: 2 };
const processador = (config: Partial<typeof configPadrao> = {}) =>
  new ImageProcessor({ ...configPadrao, ...config } as AppConfig);

const ehWebp = (b: Buffer) =>
  b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP';

describe('Funcionalidade: Processar imagem enviada (RNF02, RNF05)', () => {
  describe('Cenário: JPEG grande do panfleto é reduzido e convertido para WebP', () => {
    it('Então sai WebP de 2400x1800', async () => {
      const r = await processador().processar(await imagens.jpeg(4000, 3000), 'panfleto');
      expect(ehWebp(r.conteudo)).toBe(true);
      expect(r).toMatchObject({
        largura: 2400,
        altura: 1800,
        contentType: 'image/webp',
        bytes: r.conteudo.length,
      });
    });
  });

  describe('Cenário: imagem menor que o limite não é ampliada', () => {
    it('Então mantém 600x400', async () =>
      expect(await processador().processar(await imagens.png(600, 400), 'produto')).toMatchObject({
        largura: 600,
        altura: 400,
      }));
  });

  describe('Cenário: imagem em retrato respeita o lado maior', () => {
    it('Então fica 1200x2400', async () =>
      expect(await processador().processar(await imagens.jpeg(3000, 6000), 'panfleto')).toMatchObject({
        largura: 1200,
        altura: 2400,
      }));
  });

  describe('Esquema do Cenário: perfis de saída', () => {
    it.each<[PerfilImagem, number]>([
      ['panfleto', 2400],
      ['produto', 800],
      ['logo', 512],
    ])('Dado o perfil %s, o lado maior é %i', async (perfil, max) => {
      const r = await processador().processar(await imagens.jpeg(5000, 5000), perfil);
      expect(Math.max(r.largura, r.altura)).toBe(max);
    });
  });

  describe('Cenário: orientação EXIF é aplicada', () => {
    it('Então 200x100 com Orientation=6 sai 100x200', async () =>
      expect(
        await processador().processar(await imagens.jpegComOrientacao6(200, 100), 'produto'),
      ).toMatchObject({
        largura: 100,
        altura: 200,
      }));
  });

  describe('Cenário: metadados são removidos', () => {
    it('Então o resultado não tem EXIF nem ICC', async () => {
      const entrada = await imagens.jpegComGps();
      expect((await sharp(entrada).metadata()).exif).toBeDefined();
      const r = await processador().processar(entrada, 'produto');
      const metadados = await sharp(r.conteudo).metadata();
      expect(metadados.exif).toBeUndefined();
      expect(metadados.icc).toBeUndefined();
    });
  });

  describe('Cenário: PNG com transparência mantém alpha no logo', () => {
    it('Então hasAlpha é true', async () => {
      const r = await processador().processar(await imagens.pngComAlpha(300, 300), 'logo');
      expect((await sharp(r.conteudo).metadata()).hasAlpha).toBe(true);
    });
  });

  describe('Esquema do Cenário: tipos aceitos pelos magic bytes', () => {
    it.each([
      ['JPEG', () => imagens.jpeg(100, 100)],
      ['PNG', () => imagens.png(100, 100)],
      ['WebP', () => imagens.webp(100, 100)],
    ])('Dado %s, o processamento conclui', async (_tipo, gerar) =>
      expect(ehWebp((await processador().processar(await gerar(), 'panfleto')).conteudo)).toBe(true),
    );

    it.each([
      ['GIF', () => imagens.gif(100, 100)],
      ['HEIC', async () => imagens.heic()],
      ['SVG', async () => imagens.svg()],
      ['PDF', async () => imagens.pdf()],
    ])('Dado %s, falha com IMAGEM_INVALIDA', async (_tipo, gerar) =>
      expect(processador().processar(await gerar(), 'panfleto')).rejects.toMatchObject({
        codigo: CodigoErro.IMAGEM_INVALIDA,
      }),
    );
  });

  describe('Cenário: arquivo de texto renomeado para .jpg', () => {
    it('Então IMAGEM_INVALIDA listando os tipos aceitos', () =>
      expect(processador().processar(Buffer.from('olá mundo'), 'panfleto')).rejects.toMatchObject({
        codigo: CodigoErro.IMAGEM_INVALIDA,
        detalhes: { tiposAceitos: ['image/jpeg', 'image/png', 'image/webp'] },
      }));
  });

  describe('Cenário: buffer vazio', () => {
    it('Então IMAGEM_INVALIDA', () =>
      expect(processador().processar(Buffer.alloc(0), 'panfleto')).rejects.toMatchObject({
        codigo: CodigoErro.IMAGEM_INVALIDA,
      }));
  });

  describe('Cenário: arquivo maior que MAX_IMAGEM_BYTES', () => {
    it('Então IMAGEM_MUITO_GRANDE sem chamar o sharp', async () => {
      const p = processador({ maxImagemBytes: 1000 });
      const converter = jest.spyOn(p as unknown as { converter: () => unknown }, 'converter');
      await expect(p.processar(Buffer.alloc(1001, 1), 'panfleto')).rejects.toMatchObject({
        codigo: CodigoErro.IMAGEM_MUITO_GRANDE,
        detalhes: { maxBytes: 1000 },
      });
      expect(converter).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: decompression bomb', () => {
    it('Então IMAGEM_MUITO_GRANDE com motivo "dimensoes"', async () =>
      expect(
        processador({ imagemMaxPixels: 1_000_000 }).processar(await imagens.png(2000, 2000), 'panfleto'),
      ).rejects.toMatchObject({ codigo: CodigoErro.IMAGEM_MUITO_GRANDE, detalhes: { motivo: 'dimensoes' } }));
  });

  describe('Cenário: JPEG truncado', () => {
    it('Então IMAGEM_INVALIDA', async () => {
      const inteiro = await sharp({ create: { width: 800, height: 800, channels: 3, background: '#808080' } })
        .jpeg({ quality: 95 })
        .toBuffer();
      await expect(
        processador().processar(inteiro.subarray(0, Math.floor(inteiro.length / 2)), 'panfleto'),
      ).rejects.toMatchObject({ codigo: CodigoErro.IMAGEM_INVALIDA });
    });
  });

  describe('Cenário: concorrência limitada (D3.8)', () => {
    it('Então no máximo 2 conversões simultâneas e as 5 terminam', async () => {
      const p = processador({ imagemConcorrencia: 2 });
      let emExecucao = 0;
      let maximo = 0;
      jest
        .spyOn(p as unknown as { converter: () => Promise<ImagemProcessada> }, 'converter')
        .mockImplementation(async () => {
          emExecucao += 1;
          maximo = Math.max(maximo, emExecucao);
          await new Promise((r) => setTimeout(r, 50));
          emExecucao -= 1;
          return { conteudo: Buffer.from('x'), largura: 1, altura: 1, contentType: 'image/webp', bytes: 1 };
        });
      const jpeg = await imagens.jpeg(10, 10);
      const resultados = await Promise.all(Array.from({ length: 5 }, () => p.processar(jpeg, 'produto')));
      expect(resultados).toHaveLength(5);
      expect(maximo).toBe(2);
    });
  });
});
