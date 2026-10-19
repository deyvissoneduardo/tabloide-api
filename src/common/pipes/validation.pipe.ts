import { ValidationPipe } from '@nestjs/common';
import { errosDeValidacaoParaAppError } from '../errors/validacao';

export function criarValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: errosDeValidacaoParaAppError,
  });
}
