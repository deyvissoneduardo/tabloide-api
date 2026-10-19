import sharp from 'sharp';

const fundo = { r: 200, g: 16, b: 46 };

/** Imagens geradas na hora pelo sharp: nenhum binário de teste no repositório. */
export const imagens = {
  jpeg: (largura: number, altura: number) =>
    sharp({ create: { width: largura, height: altura, channels: 3, background: fundo } })
      .jpeg()
      .toBuffer(),
  png: (largura: number, altura: number) =>
    sharp({ create: { width: largura, height: altura, channels: 3, background: fundo } })
      .png()
      .toBuffer(),
  pngComAlpha: (largura: number, altura: number) =>
    sharp({ create: { width: largura, height: altura, channels: 4, background: { ...fundo, alpha: 0.5 } } })
      .png()
      .toBuffer(),
  webp: (largura: number, altura: number) =>
    sharp({ create: { width: largura, height: altura, channels: 3, background: fundo } })
      .webp()
      .toBuffer(),
  gif: (largura: number, altura: number) =>
    sharp({ create: { width: largura, height: altura, channels: 3, background: fundo } })
      .gif()
      .toBuffer(),
  /** JPEG gravado em paisagem com EXIF Orientation=6 (exibido em retrato). */
  jpegComOrientacao6: (largura: number, altura: number) =>
    sharp({ create: { width: largura, height: altura, channels: 3, background: fundo } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer(),
  jpegComGps: () =>
    sharp({ create: { width: 64, height: 64, channels: 3, background: fundo } })
      .jpeg()
      .withExif({
        IFD0: { Copyright: 'teste', Make: 'Camera' },
        IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '1/1 0/1 0/1' },
      })
      .toBuffer(),
  /** Cabeçalho HEIC (ftypheic): o file-type reconhece, o processador recusa (D3.1). */
  heic: () =>
    Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypheic', 'ascii'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('mif1heic', 'ascii'),
      Buffer.alloc(64),
    ]),
  svg: () =>
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    ),
  pdf: () => Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'),
};
