import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { normalizarCnpj, normalizarWhatsappBr } from '../utils/text';

function criarValidador(nome: string, mensagem: string, valido: (valor: unknown) => boolean) {
  return (opcoes?: ValidationOptions): PropertyDecorator =>
    (alvo, propriedade) =>
      registerDecorator({
        name: nome,
        target: alvo.constructor,
        propertyName: propriedade as string,
        options: { message: mensagem, ...opcoes },
        validator: { validate: valido },
      });
}

export const IsWhatsappBr = criarValidador(
  'isWhatsappBr',
  'Informe um WhatsApp válido com DDD.',
  (v) => typeof v === 'string' && normalizarWhatsappBr(v) === v,
);

export const IsCnpj = criarValidador(
  'isCnpj',
  'Informe um CNPJ válido.',
  (v) => typeof v === 'string' && normalizarCnpj(v) === v,
);

export const REGEX_SENHA_FORTE = /^(?=.*[A-Za-z])(?=.*\d).+$/;
export const MENSAGEM_SENHA_FORTE =
  'A senha precisa ter de 8 a 128 caracteres, com ao menos uma letra e um número.';

export function AoMenosUmCampo(opcoes?: ValidationOptions): PropertyDecorator {
  return (alvo, propriedade) =>
    registerDecorator({
      name: 'aoMenosUmCampo',
      target: alvo.constructor,
      propertyName: propriedade as string,
      options: { message: 'Informe ao menos um campo.', ...opcoes },
      validator: {
        validate: (_valor: unknown, args: ValidationArguments) =>
          Object.entries(args.object).some(([chave, valor]) => chave !== propriedade && valor !== undefined),
      },
    });
}
