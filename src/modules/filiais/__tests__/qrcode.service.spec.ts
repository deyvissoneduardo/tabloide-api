import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';
import type { AppConfig } from '../../../config/app.config';
import { QrCodeService } from '../services/qrcode.service';

const servico = (publicBaseUrl = 'https://tabloide.app') => new QrCodeService({ publicBaseUrl } as AppConfig);

function decodificarPng(buffer: Buffer) {
  const png = PNG.sync.read(buffer);
  return { largura: png.width, texto: jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data };
}

describe('Funcionalidade: QR Code da filial (RN11, RN39)', () => {
  describe('Cenário: URL pública', () => {
    it('Então recebo base + /f/ + código', () =>
      expect(servico().urlPublica('k7Qm2xPa')).toBe('https://tabloide.app/f/k7Qm2xPa'));
  });

  describe('Cenário: SVG', () => {
    it('Então é SVG com a cor preta sobre branco', async () => {
      const { conteudo, contentType } = await servico().gerar('k7Qm2xPa', 'svg', 512);
      expect(contentType).toBe('image/svg+xml');
      expect(String(conteudo).startsWith('<svg')).toBe(true);
      expect(String(conteudo)).toContain('#000000');
    });
  });

  describe('Cenário: PNG com tamanho', () => {
    it('Então é PNG com a largura pedida (lida do cabeçalho IHDR)', async () => {
      const { conteudo, contentType } = await servico().gerar('k7Qm2xPa', 'png', 1024);
      const png = conteudo as Buffer;
      expect(contentType).toBe('image/png');
      expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      expect(png.readUInt32BE(16)).toBe(1024);
    });

    it('E decodifica para a URL pública', async () => {
      const { conteudo } = await servico().gerar('k7Qm2xPa', 'png', 256);
      expect(decodificarPng(conteudo as Buffer)).toEqual({
        largura: 256,
        texto: 'https://tabloide.app/f/k7Qm2xPa',
      });
    });
  });

  describe('Cenário: ETag determinístico', () => {
    it('Então os mesmos parâmetros dão o mesmo ETag fraco', () => {
      const s = servico();
      expect(s.etag('k7Qm2xPa', 'svg', 512)).toBe(s.etag('k7Qm2xPa', 'svg', 512));
      expect(s.etag('k7Qm2xPa', 'svg', 512)).toMatch(/^W\/"[0-9a-f]{40}"$/);
    });
  });

  describe('Cenário: ETag muda com formato, tamanho, código ou URL base', () => {
    it('Então todos os ETags são diferentes', () => {
      const etags = [
        servico().etag('k7Qm2xPa', 'svg', 512),
        servico().etag('k7Qm2xPa', 'png', 512),
        servico().etag('k7Qm2xPa', 'png', 1024),
        servico().etag('aaaaaaaa', 'svg', 512),
        servico('https://outro.app').etag('k7Qm2xPa', 'svg', 512),
      ];
      expect(new Set(etags).size).toBe(etags.length);
    });
  });

  describe('Cenário: nível de correção e margem', () => {
    it('Então a lib recebe errorCorrectionLevel "M" e margin 2', async () => {
      const toString = jest.spyOn(QRCode, 'toString');
      await servico().gerar('k7Qm2xPa', 'svg', 512);
      expect(toString).toHaveBeenCalledWith(
        'https://tabloide.app/f/k7Qm2xPa',
        expect.objectContaining({ errorCorrectionLevel: 'M', margin: 2 }),
      );
      toString.mockRestore();
    });
  });
});
