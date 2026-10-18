import { hash, verify } from '@node-rs/argon2';
import { Injectable } from '@nestjs/common';

/** argon2id com o mínimo recomendado pela OWASP (cerca de 30–50 ms por hash). */
const OPCOES_ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

@Injectable()
export class SenhaService {
  gerarHash(senha: string): Promise<string> {
    return hash(senha, OPCOES_ARGON2);
  }

  async verificar(hashGravado: string, senha: string): Promise<boolean> {
    try {
      return await verify(hashGravado, senha);
    } catch {
      return false;
    }
  }
}
