import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { FormatoQrCode } from '../services/qrcode.service';

export class QrCodeQueryDto {
  @IsOptional()
  @IsIn(['svg', 'png'], { message: 'formato deve ser svg ou png' })
  formato: FormatoQrCode = 'svg';

  /** Lado em pixels; só vale para PNG. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tamanho deve estar entre 128 e 2048' })
  @Min(128, { message: 'tamanho deve estar entre 128 e 2048' })
  @Max(2048, { message: 'tamanho deve estar entre 128 e 2048' })
  tamanho: number = 512;

  @IsOptional()
  @IsIn(['0', '1'], { message: 'download deve ser 0 ou 1' })
  download: '0' | '1' = '0';
}
