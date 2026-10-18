/** Models cujas consultas precisam obrigatoriamente filtrar por tenantId. */
export const MODELOS_TENANT_SCOPED = new Set<Function>();

export function TenantScoped(): ClassDecorator {
  return (alvo) => {
    MODELOS_TENANT_SCOPED.add(alvo);
  };
}
