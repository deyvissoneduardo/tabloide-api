import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import QRCode, { type QRCodeRenderersOptions } from 'qrcode';
import { AppConfig } from '../../../config/app.config';
import { urlPublicaDaFilial } from '../domain/url-publica';

export type FormatoQrCode = 'svg' | 'png';

export interface QrCodeGerado {
  conteudo: Buffer | string;
  contentType: 'image/svg+xml' | 'image/png';
}

/** Preto sobre branco sempre: ser lido por qualquer câmera vem antes da identidade visual. */
const OPCOES_QR = {
  errorCorrectionLevel: 'M',
  margin: 2,
  color: { dark: '#000000', light: '#FFFFFF' },
} as const;

@Injectable()
export class QrCodeService {
  constructor(private readonly config: AppConfig) {}

  urlPublica(codigoPublico: string): string {
    return urlPublicaDaFilial(this.config.publicBaseUrl, codigoPublico);
  }

  /** Calculado sem gerar a imagem: o controller responde 304 antes de qualquer trabalho. */
  etag(codigoPublico: string, formato: FormatoQrCode, tamanho: number): string {
    const chave = [codigoPublico, formato, tamanho, this.config.publicBaseUrl].join('|');
    return `W/"${createHash('sha1').update(chave).digest('hex')}"`;
  }

  async gerar(codigoPublico: string, formato: FormatoQrCode, tamanho: number): Promise<QrCodeGerado> {
    const url = this.urlPublica(codigoPublico);
    if (formato === 'png') {
      const opcoes: QRCodeRenderersOptions = { ...OPCOES_QR, width: tamanho };
      return { conteudo: await QRCode.toBuffer(url, { ...opcoes, type: 'png' }), contentType: 'image/png' };
    }
    return {
      conteudo: await QRCode.toString(url, { ...OPCOES_QR, type: 'svg' }),
      contentType: 'image/svg+xml',
    };
  }
}
