import type { Sequelize } from 'sequelize-typescript';
import type { ClockService } from '../../../common/clock/clock.service';
import { CodigoErro } from '../../../common/errors/codigos-erro';
import type { MidiaService } from '../../midia/services/midia.service';
import { ExportacaoDadosService } from '../services/exportacao-dados.service';

const AGORA = new Date('2026-11-25T12:00:00Z');

describe('Funcionalidade: Exportação dos dados do lojista (LGPD art. 18, II e V)', () => {
  const query = jest.fn();
  const midia = { urlPublica: jest.fn((c: string | null) => (c ? `https://cdn/${c}` : null)) };
  const service = new ExportacaoDadosService(
    { query } as unknown as Sequelize,
    { agora: () => AGORA } as ClockService,
    midia as unknown as MidiaService,
  );

  /** Responde pela tabela citada no FROM da consulta. */
  function respostas(porTabela: Record<string, object[]>) {
    query.mockImplementation(async (sql: string) => {
      const tabela = /FROM (\w+)/.exec(sql)?.[1] ?? '';
      return porTabela[tabela] ?? [];
    });
  }

  beforeEach(() => query.mockReset());

  it('Cenário: Dado um lojista com conteúdo, então devolve tudo com URLs no lugar dos paths', async () => {
    respostas({
      lojistas: [{ id: 't1', email: 'ana@x.com', logoPath: 'logos/a.webp', termosVersao: '2026-11-25' }],
      filiais: [{ id: 'f1', cidade: 'Recife', excluidaEm: null }],
      panfletos: [{ id: 'p1', arquivoPath: 'panfletos/p.webp' }],
      categorias: [{ id: 'c1', nome: 'Bebidas' }],
      produtos: [{ id: 'pr1', fotoPath: null }],
      auditoria_alteracoes: [{ entidade: 'PRODUTO', campo: 'preco' }],
      registros_acesso_painel: [{ ip: '203.0.113.7', rota: '/v1/filiais' }],
    });

    const exportado = await service.exportar('t1');

    expect(exportado).toEqual({
      geradoEm: AGORA.toISOString(),
      lojista: {
        id: 't1',
        email: 'ana@x.com',
        logoUrl: 'https://cdn/logos/a.webp',
        termosVersao: '2026-11-25',
      },
      filiais: [{ id: 'f1', cidade: 'Recife', excluidaEm: null }],
      panfletos: [{ id: 'p1', arquivoUrl: 'https://cdn/panfletos/p.webp' }],
      categorias: [{ id: 'c1', nome: 'Bebidas' }],
      produtos: [{ id: 'pr1', fotoUrl: null }],
      historicoAlteracoes: [{ entidade: 'PRODUTO', campo: 'preco' }],
      registrosAcessoPainel: [{ ip: '203.0.113.7', rota: '/v1/filiais' }],
    });
  });

  it('Cenário: Dado qualquer consulta, então todas filtram pelo tenant (RN07)', async () => {
    respostas({ lojistas: [{ id: 't1', logoPath: null }] });
    await service.exportar('t1');
    expect(query).toHaveBeenCalledTimes(7);
    for (const [sql, opcoes] of query.mock.calls) {
      expect(sql).toMatch(/(tenant_id|l\.id) = :tenantId/);
      expect(opcoes.replacements).toEqual({ tenantId: 't1' });
    }
  });

  it('Cenário: Dado lojista inexistente, então RECURSO_NAO_ENCONTRADO sem consultar o resto', async () => {
    respostas({});
    await expect(service.exportar('t1')).rejects.toMatchObject({ codigo: CodigoErro.RECURSO_NAO_ENCONTRADO });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
