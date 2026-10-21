const base = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
        astTransformers: { before: ['<rootDir>/test/helpers/swagger-transformer.js'] },
      },
    ],
  },
};

module.exports = {
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/**/*.dto.ts',
    '!src/**/models/**',
    '!src/**/__tests__/**',
  ],
  coverageThreshold: {
    global: { lines: 80, branches: 80 },
    './src/**/services/**': { lines: 90, branches: 90 },
    './src/common/utils/**': { lines: 90, branches: 90 },
    './src/database/tenant-scope.hooks.ts': { lines: 90, branches: 90 },
    './src/modules/vigencia/domain/': { lines: 100, branches: 100 },
  },
  projects: [
    {
      ...base,
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/helpers/jest-unit.setup.ts'],
    },
    {
      ...base,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/**/*.int-spec.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/helpers/jest-integracao.setup.ts'],
    },
  ],
};
