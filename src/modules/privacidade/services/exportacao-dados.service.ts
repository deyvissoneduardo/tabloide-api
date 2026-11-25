import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ClockService } from '../../../common/clock/clock.service';
import { naoEncontrado } from '../../../common/errors/errors';
import { MidiaService } from '../../midia/services/midia.service';

type Linha = Record<string, unknown>;

/** Toda consulta filtra por tenant_id (RN07); itens excluídos entram, porque também são dados do titular. */
const SQL = {
  lojista: `
    SELECT l.id, l.nome_fantasia AS "nomeFantasia", l.nome_responsavel AS "nomeResponsavel", l.email,
           l.whatsapp, l.cnpj, l.logo_path AS "logoPath", a.status, l.termos_versao AS "termosVersao",
           l.termos_aceitos_em AS "termosAceitosEm", l.encerrado_em AS "encerradoEm",
           l.created_at AS "cadastradoEm", l.updated_at AS "atualizadoEm"
    FROM lojistas l LEFT JOIN lojista_ativacoes a ON a.lojista_id = l.id
    WHERE l.id = :tenantId`,
  filiais: `
    SELECT f.id, f.nome, f.codigo_publico AS "codigoPublico", f.fuso_horario AS "fusoHorario",
           e.cep, e.logradouro, e.numero, e.complemento, e.bairro, e.cidade, e.uf,
           f.created_at AS "criadaEm", f.deleted_at AS "excluidaEm"
    FROM filiais f LEFT JOIN filial_enderecos e ON e.filial_id = f.id AND e.tenant_id = f.tenant_id
    WHERE f.tenant_id = :tenantId ORDER BY f.created_at`,
  panfletos: `
    SELECT id, filial_id AS "filialId", tipo_arquivo AS "tipoArquivo", imagem_path AS "arquivoPath",
           data_inicio AS "dataInicio", data_limite AS "dataLimite", created_at AS "criadoEm",
           deleted_at AS "excluidoEm"
    FROM panfletos WHERE tenant_id = :tenantId ORDER BY created_at`,
  categorias: `
    SELECT id, filial_id AS "filialId", nome, posicao, created_at AS "criadaEm", deleted_at AS "excluidaEm"
    FROM categorias WHERE tenant_id = :tenantId ORDER BY created_at`,
  produtos: `
    SELECT id, filial_id AS "filialId", categoria_id AS "categoriaId", nome, quantidade,
           preco_promocional_centavos AS "precoPromocionalCentavos",
           preco_original_centavos AS "precoOriginalCentavos", descricao, observacao, foto_path AS "fotoPath",
           data_inicio AS "dataInicio", data_limite AS "dataLimite", posicao, created_at AS "criadoEm",
           deleted_at AS "excluidoEm"
    FROM produtos WHERE tenant_id = :tenantId ORDER BY created_at`,
  historicoAlteracoes: `
    SELECT entidade, entidade_id AS "entidadeId", campo, valor_anterior AS "valorAnterior",
           valor_novo AS "valorNovo", alterado_em AS "alteradoEm"
    FROM auditoria_alteracoes WHERE tenant_id = :tenantId ORDER BY alterado_em`,
  registrosAcessoPainel: `
    SELECT host(ip) AS ip, metodo, rota, ocorrido_em AS "ocorridoEm"
    FROM registros_acesso_painel WHERE tenant_id = :tenantId ORDER BY ocorrido_em`,
} as const;

/**
 * LGPD art. 18, II e V: exporta em JSON os dados pessoais e o conteúdo de um lojista, para atender
 * acesso e portabilidade pela rota admin. Paths internos de mídia saem como URL pública.
 */
@Injectable()
export class ExportacaoDadosService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly clock: ClockService,
    private readonly midia: MidiaService,
  ) {}

  async exportar(tenantId: string): Promise<Linha> {
    const [lojista] = await this.consultar('lojista', tenantId);
    if (!lojista) throw naoEncontrado();

    const [filiais, panfletos, categorias, produtos, historicoAlteracoes, registrosAcessoPainel] =
      await Promise.all([
        this.consultar('filiais', tenantId),
        this.consultar('panfletos', tenantId),
        this.consultar('categorias', tenantId),
        this.consultar('produtos', tenantId),
        this.consultar('historicoAlteracoes', tenantId),
        this.consultar('registrosAcessoPainel', tenantId),
      ]);

    return {
      geradoEm: this.clock.agora().toISOString(),
      lojista: this.trocarPath(lojista, 'logoPath', 'logoUrl'),
      filiais,
      panfletos: panfletos.map((p) => this.trocarPath(p, 'arquivoPath', 'arquivoUrl')),
      categorias,
      produtos: produtos.map((p) => this.trocarPath(p, 'fotoPath', 'fotoUrl')),
      historicoAlteracoes,
      registrosAcessoPainel,
    };
  }

  private consultar(consulta: keyof typeof SQL, tenantId: string): Promise<Linha[]> {
    return this.sequelize.query<Linha>(SQL[consulta], {
      replacements: { tenantId },
      type: QueryTypes.SELECT,
    });
  }

  private trocarPath(linha: Linha, campoPath: string, campoUrl: string): Linha {
    const { [campoPath]: caminho, ...resto } = linha;
    return { ...resto, [campoUrl]: this.midia.urlPublica((caminho as string | null) ?? null) };
  }
}
