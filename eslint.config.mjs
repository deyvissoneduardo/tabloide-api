// @ts-check
import tseslint from 'typescript-eslint';

const restricao = (padroes) => ['error', { patterns: padroes }];

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'plans/**', 'src/database/migrations/**', '**/*.js', '**/*.mjs'] },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },
  // Regras de dependência do MVC (00-visao-geral.md)
  {
    files: ['src/**/controllers/**/*.ts'],
    rules: {
      'no-restricted-imports': restricao([
        { group: ['**/models/*.model'], message: 'Controller acessa model só via service.' },
      ]),
    },
  },
  {
    files: ['src/**/views/**/*.ts'],
    rules: {
      'no-restricted-imports': restricao([
        { group: ['**/services/**'], message: 'View não chama service.' },
        { group: ['sequelize', 'sequelize-typescript'], message: 'View não acessa banco.' },
      ]),
    },
  },
  {
    files: ['src/**/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': restricao([
        {
          group: ['@nestjs/*', 'sequelize', 'sequelize-typescript'],
          message: 'Domain é puro: sem Nest nem Sequelize.',
        },
      ]),
    },
  },
  {
    files: ['src/**/services/**/*.ts'],
    rules: {
      'no-restricted-imports': restricao([
        { group: ['**/controllers/**'], message: 'Service não importa controller.' },
      ]),
    },
  },
  // Relógio: regra de negócio usa ClockService
  {
    files: ['src/modules/**/services/**/*.ts', 'src/modules/**/domain/**/*.ts'],
    ignores: ['**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Use ClockService.agora().',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Use ClockService.agora().',
        },
      ],
    },
  },
  {
    files: ['**/__tests__/**/*.ts', 'test/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
