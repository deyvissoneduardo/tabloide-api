import { Injectable, Logger } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ClockService } from '../../../common/clock/clock.service';
import { mensagemDeErro } from '../../../common/errors/mensagem-de-erro';
import { MetricasService } from '../../../common/observabilidade/metricas.service';
import { dataEHoraNoFuso } from '../../../common/utils/date-only';

/** D5: a página espera a gravação no máximo isto; depois responde sem ela. */
export const REGISTRO_ACESSO_TIMEOUT_MS = 250;

/** Primeiro ON CONFLICT do projeto: uma linha por (filial, data, hora), incrementada. */
const SQL_REGISTRAR = `
  INSERT INTO acessos_filial (tenant_id, filial_id, data, hora, quantidade)
  VALUES (:tenantId, :filialId, :data, :hora, 1)
  ON CONFLICT (filial_id, data, hora)
  DO UPDATE SET quantidade = acessos_filial.quantidade + 1`;

export interface AcessoAoRegistrar {
  tenantId: string;
  filialId: string;
  fuso: string;
}

const ESTOUROU = Symbol('estourou');

/**
 * Conta um acesso à página pública (RN50–RN52), no fuso da filial (D6). Nunca rejeita:
 * erro ou estouro de tempo viram métrica e log, e a página responde normalmente (D5).
 * O tenantId vem da página montada no servidor, nunca do cliente; SQL cru, sem transação.
 */
@Injectable()
export class RegistroAcessosService {
  private readonly logger = new Logger(RegistroAcessosService.name);

  constructor(
    private readonly sequelize: Sequelize,
    private readonly clock: ClockService,
    private readonly metricas: MetricasService,
  ) {}

  async registrar(acesso: AcessoAoRegistrar): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const { data, hora } = dataEHoraNoFuso(acesso.fuso, this.clock.agora());
      const gravacao = this.sequelize.query(SQL_REGISTRAR, {
        replacements: { tenantId: acesso.tenantId, filialId: acesso.filialId, data, hora },
        type: QueryTypes.INSERT,
      });
      // a query segue no banco depois do estouro; o resultado tardio é descartado sem rejeição solta
      gravacao.catch(() => undefined);
      const limite = new Promise<typeof ESTOUROU>((resolve) => {
        timer = setTimeout(() => resolve(ESTOUROU), REGISTRO_ACESSO_TIMEOUT_MS);
      });
      if ((await Promise.race([gravacao, limite])) === ESTOUROU) {
        this.metricas.contarFalhaRegistroAcesso('timeout');
        this.logger.warn({ evento: 'acesso.registro_timeout', filialId: acesso.filialId });
        return;
      }
      this.metricas.contarAcessoRegistrado();
    } catch (err) {
      this.metricas.contarFalhaRegistroAcesso('erro');
      this.logger.warn({
        evento: 'acesso.registro_falhou',
        filialId: acesso.filialId,
        erro: mensagemDeErro(err),
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
