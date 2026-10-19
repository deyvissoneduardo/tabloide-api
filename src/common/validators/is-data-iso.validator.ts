import { registerDecorator, ValidationOptions } from 'class-validator';
import { ehDataISO } from '../utils/date-only';

export function IsDataISO(
  opcoes: { anulavel?: boolean } = {},
  validacao?: ValidationOptions,
): PropertyDecorator {
  return (alvo, propriedade) =>
    registerDecorator({
      name: 'isDataISO',
      target: alvo.constructor,
      propertyName: propriedade as string,
      options: {
        message: `${String(propriedade)} deve ser uma data válida no formato AAAA-MM-DD`,
        ...validacao,
      },
      validator: {
        validate: (valor: unknown) =>
          (opcoes.anulavel === true && valor === null) || (typeof valor === 'string' && ehDataISO(valor)),
      },
    });
}
