import { resolverDataInicio, validarDatas } from './datas';
import { calcularSituacao } from './situacao';
import {
  erro,
  type DataISO,
  type DatasInformadas,
  type ItemComVigencia,
  type Periodo,
  type ResultadoValidacao,
} from './vigencia.types';

/**
 * Regras de edição de datas (RN26, RN42). Não verifica sobreposição: isso é da Fase 3.
 * - Vencido ou excluído: não editável.
 * - Vigente: o início não muda (reenviar o mesmo valor é aceito); o limite pode ir até hoje.
 * - Agendado: o início pode mudar; null publica agora.
 */
export function validarEdicaoDeDatas(
  atual: ItemComVigencia,
  novas: DatasInformadas,
  hoje: DataISO,
): ResultadoValidacao<Periodo> {
  const situacao = calcularSituacao(atual, hoje);
  if (situacao === 'EXCLUIDO' || situacao === 'VENCIDO') return erro('ITEM_NAO_EDITAVEL', 'dataInicio');

  let inicio = atual.dataInicio;
  if (novas.dataInicio !== undefined) {
    if (situacao === 'VIGENTE') {
      if (novas.dataInicio !== atual.dataInicio) return erro('DATA_INICIO_IMUTAVEL', 'dataInicio');
    } else {
      const resolvido = resolverDataInicio(novas.dataInicio, hoje);
      if (!resolvido.ok) return resolvido;
      inicio = resolvido.valor;
    }
  }

  const limite = novas.dataLimite === undefined ? atual.dataLimite : novas.dataLimite;
  return validarDatas(inicio, limite, hoje);
}
