import {
  erro,
  ok,
  type DataISO,
  type DatasInformadas,
  type Periodo,
  type ResultadoValidacao,
} from './vigencia.types';

/** RN40: sem início vale a partir de hoje. D5: início no passado é recusado. */
export function resolverDataInicio(
  informada: DataISO | null | undefined,
  hoje: DataISO,
): ResultadoValidacao<DataISO> {
  if (informada === undefined || informada === null) return ok(hoje);
  if (informada < hoje) return erro('DATA_INICIO_INVALIDA', 'dataInicio');
  return ok(informada);
}

/** RN42: o limite não pode ser anterior ao início nem a hoje. Limite igual ao início vale um dia. */
export function validarDatas(
  inicio: DataISO,
  limite: DataISO | null,
  hoje: DataISO,
): ResultadoValidacao<Periodo> {
  if (limite === null) return ok({ inicio, limite: null });
  if (limite < inicio || limite < hoje) return erro('DATA_LIMITE_INVALIDA', 'dataLimite');
  return ok({ inicio, limite });
}

/** Ponto de entrada do cadastro de panfleto (Fase 3) e de produto (Fase 4). */
export function validarCriacao(informadas: DatasInformadas, hoje: DataISO): ResultadoValidacao<Periodo> {
  const inicio = resolverDataInicio(informadas.dataInicio, hoje);
  if (!inicio.ok) return inicio;
  return validarDatas(inicio.valor, informadas.dataLimite ?? null, hoje);
}
