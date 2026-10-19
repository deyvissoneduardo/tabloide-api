import { duracaoParaMs, validarEnv } from '../env.schema';

const envValido = () => ({
  NODE_ENV: 'test',
  PORT: '4000',
  LOG_LEVEL: 'warn',
  DATABASE_URL: 'postgres://u:s@localhost:5432/db',
  DB_POOL_MAX: '5',
  DB_SSL: 'true',
  JWT_SECRET: 'x'.repeat(32),
  JWT_EXPIRES_IN: '2h',
  ADMIN_API_KEY: 'k'.repeat(32),
  LOGIN_RATE_LIMIT: '3',
  LOGIN_RATE_TTL_SECONDS: '60',
  TENANT_STATUS_CACHE_TTL_MS: '1000',
  PUBLIC_BASE_URL: 'https://tabloide.app',
  FUSO_HORARIO_PADRAO: 'America/Manaus',
});

const minimo = () => ({
  DATABASE_URL: 'postgresql://u:s@localhost/db',
  JWT_SECRET: 'x'.repeat(32),
  ADMIN_API_KEY: 'k'.repeat(32),
  PUBLIC_BASE_URL: 'http://localhost:5173',
});

describe('Funcionalidade: Validação das variáveis de ambiente', () => {
  describe('Cenário: env completo e válido', () => {
    it('Então devolve o objeto tipado, com PORT numérico e DB_SSL booleano', () => {
      const env = validarEnv(envValido());
      expect(env.PORT).toBe(4000);
      expect(env.DB_SSL).toBe(true);
      expect(env.DB_POOL_MAX).toBe(5);
    });
  });

  describe('Cenário: valores padrão', () => {
    it('Então PORT 3000, DB_POOL_MAX 10, JWT_EXPIRES_IN 8h, LOGIN_RATE_LIMIT 5 e TTL 900', () => {
      const env = validarEnv(minimo());
      expect(env).toMatchObject({
        PORT: 3000,
        DB_POOL_MAX: 10,
        DB_SSL: false,
        JWT_EXPIRES_IN: '8h',
        LOGIN_RATE_LIMIT: 5,
        LOGIN_RATE_TTL_SECONDS: 900,
        TENANT_STATUS_CACHE_TTL_MS: 30000,
        LOG_LEVEL: 'info',
        FUSO_HORARIO_PADRAO: 'America/Sao_Paulo',
      });
    });
  });

  describe.each([
    ['JWT_SECRET curto', { JWT_SECRET: 'x'.repeat(31) }, 'JWT_SECRET'],
    ['ADMIN_API_KEY ausente', { ADMIN_API_KEY: undefined }, 'ADMIN_API_KEY'],
    ['DATABASE_URL com protocolo errado', { DATABASE_URL: 'mysql://x' }, 'DATABASE_URL'],
    ['JWT_EXPIRES_IN em formato inválido', { JWT_EXPIRES_IN: '8 horas' }, 'JWT_EXPIRES_IN'],
    ['DB_POOL_MAX zero', { DB_POOL_MAX: '0' }, 'DB_POOL_MAX'],
    ['DB_POOL_MAX acima de 50', { DB_POOL_MAX: '51' }, 'DB_POOL_MAX'],
    ['PUBLIC_BASE_URL ausente', { PUBLIC_BASE_URL: undefined }, 'PUBLIC_BASE_URL'],
    ['PUBLIC_BASE_URL com barra final', { PUBLIC_BASE_URL: 'https://tabloide.app/' }, 'PUBLIC_BASE_URL'],
    ['PUBLIC_BASE_URL sem http', { PUBLIC_BASE_URL: 'ftp://tabloide.app' }, 'PUBLIC_BASE_URL'],
    ['FUSO_HORARIO_PADRAO inválido', { FUSO_HORARIO_PADRAO: 'Marte/Olympus' }, 'FUSO_HORARIO_PADRAO'],
    ['FUSO_HORARIO_PADRAO não geográfico', { FUSO_HORARIO_PADRAO: 'UTC' }, 'FUSO_HORARIO_PADRAO'],
  ])('Cenário: %s', (_nome, sobrescrita, variavel) => {
    it(`Então lança erro citando ${variavel}`, () => {
      expect(() => validarEnv({ ...envValido(), ...sobrescrita })).toThrow(variavel);
    });
  });

  describe('Cenário: fuso padrão normalizado', () => {
    it('Então "america/manaus" vira "America/Manaus"', () =>
      expect(validarEnv({ ...envValido(), FUSO_HORARIO_PADRAO: 'america/manaus' }).FUSO_HORARIO_PADRAO).toBe(
        'America/Manaus',
      ));
  });

  describe('Cenário: vários erros de uma vez', () => {
    it('Então a mensagem lista JWT_SECRET e ADMIN_API_KEY', () => {
      const { JWT_SECRET: _a, ADMIN_API_KEY: _b, ...semSegredos } = envValido();
      expect(() => validarEnv(semSegredos)).toThrow(/JWT_SECRET[\s\S]*ADMIN_API_KEY/);
    });
  });

  describe('Cenário: conversão de duração', () => {
    it('Então 8h, 30m, 45s e 1d viram milissegundos', () => {
      expect([duracaoParaMs('8h'), duracaoParaMs('30m'), duracaoParaMs('45s'), duracaoParaMs('1d')]).toEqual([
        28_800_000, 1_800_000, 45_000, 86_400_000,
      ]);
    });
  });
});
