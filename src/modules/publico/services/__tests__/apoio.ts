import { MetricasService } from '../../../../common/observabilidade/metricas.service';
import type { DataISO } from '../../../../common/utils/date-only';
import type { AppConfig } from '../../../../config/app.config';
import { StatusLojista } from '../../../lojistas/models/status-lojista';
import type { FilialPublicaRow, ProdutoRow } from '../../domain/montar-pagina';
import { PaginaPublicaCache, type PaginaPublicaPronta } from '../pagina-publica.cache';

export const configCache = (opcoes: Partial<AppConfig['publicoCache']> = {}) =>
  ({
    publicoCache: { max: 5000, ttlMaxSeg: 60, negativoSeg: 10, desativado: false, ...opcoes },
  }) as AppConfig;

export const novoCache = (opcoes: Partial<AppConfig['publicoCache']> = {}) =>
  new PaginaPublicaCache(configCache(opcoes), new MetricasService());

/** Builder da linha da consulta 1. */
export function umaFilialPublica() {
  const filial: FilialPublicaRow = {
    id: 'f1',
    tenantId: 't1',
    nome: 'Centro',
    endereco: 'Rua das Flores, 120',
    fusoHorario: 'America/Sao_Paulo',
    lojista: {
      nomeFantasia: 'Mercado Bom Preço',
      logoPath: null,
      corPrimaria: null,
      corSecundaria: null,
      status: StatusLojista.ATIVO,
    },
  };
  const builder = {
    comStatus(status: StatusLojista) {
      filial.lojista.status = status;
      return builder;
    },
    comFuso(fuso: string) {
      filial.fusoHorario = fuso;
      return builder;
    },
    build: () => structuredClone(filial),
  };
  return builder;
}

export const umProduto = (nome: string, categoria: string, dados: Partial<ProdutoRow> = {}): ProdutoRow => ({
  id: `id-${nome}`,
  nome,
  quantidade: null,
  precoPromocionalCentavos: 100,
  precoOriginalCentavos: null,
  descricao: null,
  observacao: null,
  fotoPath: null,
  dataLimite: null,
  categoria: { id: `c-${categoria}`, nome: categoria },
  ...dados,
});

export const umaPaginaPronta = (dados: Partial<PaginaPublicaPronta> = {}): PaginaPublicaPronta => ({
  corpo: '{}',
  corpoGzip: Buffer.from(''),
  etag: 'W/"x"',
  hoje: '2026-10-18' as DataISO,
  fuso: 'America/Sao_Paulo',
  tenantId: 't1',
  filialId: 'f1',
  ...dados,
});
