import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/** ExecutionContext mínimo para testar guards, com metadata real lida pelo Reflector. */
export function contextoFalso(req: Record<string, unknown>, metadata: Record<string, unknown> = {}) {
  const handler = () => undefined;
  class ControllerFalso {}
  for (const [chave, valor] of Object.entries(metadata)) Reflect.defineMetadata(chave, valor, handler);
  const ctx = {
    getHandler: () => handler,
    getClass: () => ControllerFalso,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
  return { ctx, reflector: new Reflector() };
}
