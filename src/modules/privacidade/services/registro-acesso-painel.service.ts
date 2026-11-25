import { Injectable, Logger } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';
import { ClockService } from '../../../common/clock/clock.service';
import { mensagemDeErro } from '../../../common/errors/mensagem-de-erro';

const SQL_REGISTRAR = `
  INSERT INTO registros_acesso_painel (id, tenant_id, ip, metodo, rota, ocorrido_em)
  VALUES (:id, :tenantId, CAST(:ip AS inet), :metodo, :rota, :ocorridoEm)`;

export const ROTA_MAX = 500;

export interface AcessoAoPainel {
  tenantId: string;
  ip: string | undefined;
  metodo: string;
  /** URL da requisição; a query string é descartada (minimização). */
  url: string;
}

/**
 * Registro de acesso ao painel (Marco Civil da Internet, art. 15; guarda de 6 meses). O tenantId vem
 * do JWT ou da sessão recém-emitida, nunca do cliente. Nunca rejeita: falha vira log e a requisição
 * segue, para o registro não derrubar o painel.
 */
@Injectable()
export class RegistroAcessoPainelService {
  private readonly logger = new Logger(RegistroAcessoPainelService.name);

  constructor(
    private readonly sequelize: Sequelize,
    private readonly clock: ClockService,
  ) {}

  async registrar(acesso: AcessoAoPainel): Promise<void> {
    try {
      await this.sequelize.query(SQL_REGISTRAR, {
        replacements: {
          id: uuidv7(),
          tenantId: acesso.tenantId,
          ip: acesso.ip || null,
          metodo: acesso.metodo.slice(0, 10),
          rota: acesso.url.replace(/\?.*$/s, '').slice(0, ROTA_MAX),
          ocorridoEm: this.clock.agora(),
        },
        type: QueryTypes.INSERT,
      });
    } catch (erro) {
      this.logger.error({ evento: 'acesso_painel.registro_falhou', erro: mensagemDeErro(erro) });
    }
  }
}
