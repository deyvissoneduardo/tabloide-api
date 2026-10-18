import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { naoAutenticado } from '../errors/errors';

const CHAVE_TENANT = 'tenantId';

@Injectable()
export class TenantContext {
  constructor(private readonly cls: ClsService) {}

  definir(tenantId: string): void {
    this.cls.set(CHAVE_TENANT, tenantId);
  }

  obter(): string | undefined {
    return this.cls.get<string | undefined>(CHAVE_TENANT);
  }

  obterObrigatorio(): string {
    const tenantId = this.obter();
    if (!tenantId) throw naoAutenticado();
    return tenantId;
  }
}
