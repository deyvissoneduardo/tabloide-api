import { diasEntre, somarDias, type DataISO } from '../../../common/utils/date-only';
import { MINIMO_ACESSOS_PICO, type Intervalo } from './periodo-relatorio';

export interface FilialDoResumo {
  id: string;
  nome: string;
  excluida: boolean;
}

export interface EntradaResumo {
  intervalo: Intervalo;
  filiais: FilialDoResumo[];
  /** Ignora o filtro de filial: é o ranking (RN54). */
  totaisPorFilial: ReadonlyMap<string, number>;
  porData: ReadonlyArray<{ data: DataISO; total: number }>;
  porHora: ReadonlyArray<{ hora: number; total: number }>;
  /** ISODOW: 1 = segunda … 7 = domingo. */
  porDiaSemana: ReadonlyArray<{ diaSemana: number; total: number }>;
  iniciosPanfleto: Array<{ data: DataISO; filialId: string }>;
}

export interface ResumoAcessos {
  intervalo: Intervalo;
  total: number;
  porFilial: Array<{ filialId: string; nome: string; excluida: boolean; total: number }>;
  porDia: Array<{ data: DataISO; total: number }>;
  iniciosPanfleto: Array<{ data: DataISO; filialId: string }>;
  pico: { disponivel: boolean; minimo: number; porHora: number[] | null; porDiaSemana: number[] | null };
}

const porNome = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/** RN54/RN57: monta o resumo a partir dos agregados do banco. Puro. */
export function montarResumo(e: EntradaResumo): ResumoAcessos {
  const totalPorData = new Map(e.porData.map((x) => [x.data, x.total]));
  const porDia = Array.from({ length: diasEntre(e.intervalo.inicio, e.intervalo.fim) + 1 }, (_, i) => {
    const data = somarDias(e.intervalo.inicio, i);
    return { data, total: totalPorData.get(data) ?? 0 };
  });
  const total = porDia.reduce((soma, d) => soma + d.total, 0);

  // RN57: excluída só aparece se teve acesso no período
  const porFilial = e.filiais
    .map((f) => ({
      filialId: f.id,
      nome: f.nome,
      excluida: f.excluida,
      total: e.totaisPorFilial.get(f.id) ?? 0,
    }))
    .filter((f) => !f.excluida || f.total > 0)
    .sort((a, b) => b.total - a.total || porNome.compare(a.nome, b.nome));

  const disponivel = total >= MINIMO_ACESSOS_PICO;
  const porHora = Array<number>(24).fill(0);
  for (const x of e.porHora) porHora[x.hora] = x.total;
  const porDiaSemana = Array<number>(7).fill(0);
  for (const x of e.porDiaSemana) porDiaSemana[x.diaSemana - 1] = x.total;

  return {
    intervalo: e.intervalo,
    total,
    porFilial,
    porDia,
    iniciosPanfleto: e.iniciosPanfleto,
    pico: {
      disponivel,
      minimo: MINIMO_ACESSOS_PICO,
      porHora: disponivel ? porHora : null,
      porDiaSemana: disponivel ? porDiaSemana : null,
    },
  };
}
