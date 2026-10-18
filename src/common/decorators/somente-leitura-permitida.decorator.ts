import { SetMetadata } from '@nestjs/common';

export const SOMENTE_LEITURA_PERMITIDA = 'somenteLeituraPermitida';

export const SomenteLeituraPermitida = () => SetMetadata(SOMENTE_LEITURA_PERMITIDA, true);
