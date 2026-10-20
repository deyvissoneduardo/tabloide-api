import { z } from 'zod';
import { normalizarFuso } from '../modules/vigencia/domain/fuso';

const booleano = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const inteiro = (padrao: number) => z.coerce.number().int().default(padrao);

const envBase = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: inteiro(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/.+/, 'deve ser uma URL postgres:// ou postgresql://'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  DB_SSL: booleano,
  /** Porta 5432 (sessão/direta): DDL e pg_dump não funcionam no transaction pooler do Supabase. */
  DATABASE_URL_MIGRATIONS: z
    .string()
    .regex(/^postgres(ql)?:\/\/.+/, 'deve ser uma URL postgres:// ou postgresql://')
    .optional(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, 'use o formato <número><s|m|h|d>, ex.: 8h')
    .default('8h'),
  ADMIN_API_KEY: z.string().min(32),
  LOGIN_RATE_LIMIT: inteiro(5),
  LOGIN_RATE_TTL_SECONDS: inteiro(900),
  TENANT_STATUS_CACHE_TTL_MS: inteiro(30000),
  PUBLIC_BASE_URL: z
    .url({ protocol: /^https?$/ })
    .refine((u) => !u.endsWith('/'), 'informe a URL sem barra no final'),
  FUSO_HORARIO_PADRAO: z
    .string()
    .default('America/Sao_Paulo')
    .refine((f) => normalizarFuso(f) !== null, 'fuso horário IANA inválido')
    .transform((f) => normalizarFuso(f) as string),
  STORAGE_DRIVER: z.enum(['supabase', 'disco']).default('disco'),
  SUPABASE_URL: z.url({ protocol: /^https?$/ }).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_BUCKET: z.string().min(1).default('midia'),
  MIDIA_DIR_LOCAL: z.string().min(1).default('./.midia'),
  MIDIA_URL_BASE_LOCAL: z.url({ protocol: /^https?$/ }).default('http://localhost:3000/v1/midia-local'),
  MAX_IMAGEM_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  IMAGEM_MAX_PIXELS: z.coerce.number().int().positive().default(50_000_000),
  IMAGEM_CONCORRENCIA: z.coerce.number().int().min(1).max(16).default(2),
  /** Quantos proxies confiáveis há na frente da API (o IP real vem do X-Forwarded-For). */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  /** Origens do painel separadas por vírgula, comparadas exatamente. */
  CORS_ORIGENS_PAINEL: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  PUBLICO_CACHE_MAX: z.coerce.number().int().min(1).default(5000),
  PUBLICO_CACHE_TTL_MAX_SEG: z.coerce.number().int().min(1).default(60),
  PUBLICO_CACHE_NEGATIVO_SEG: z.coerce.number().int().min(1).default(10),
  PUBLICO_CACHE_DESATIVADO: booleano,
  PUBLICO_RATE_LIMIT_POR_MIN: z.coerce.number().int().min(1).default(300),
  PAINEL_RATE_LIMIT_POR_MIN: z.coerce.number().int().min(1).default(600),
  SHUTDOWN_DRENAGEM_MS: z.coerce.number().int().min(0).default(5000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(0).default(10000),
});

export const envSchema = envBase.superRefine((env, ctx) => {
  // em produção as imagens precisam ficar no Supabase Storage, nunca no disco do container
  if (env.NODE_ENV === 'production' && env.STORAGE_DRIVER !== 'supabase') {
    ctx.addIssue({ code: 'custom', path: ['STORAGE_DRIVER'], message: 'em production use supabase' });
  }
  if (env.NODE_ENV === 'production') {
    if (env.CORS_ORIGENS_PAINEL.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGENS_PAINEL'], message: 'obrigatório em production' });
    }
    // em produção só origens HTTPS explícitas; nada de curinga
    if (env.CORS_ORIGENS_PAINEL.some((o) => o.includes('*') || !o.startsWith('https://'))) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGENS_PAINEL'],
        message: 'use só origens https:// sem *',
      });
    }
  }
  if (env.STORAGE_DRIVER === 'supabase') {
    for (const chave of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const) {
      if (!env[chave])
        ctx.addIssue({ code: 'custom', path: [chave], message: 'obrigatório com STORAGE_DRIVER=supabase' });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export function validarEnv(raw: Record<string, unknown>): Env {
  const resultado = envSchema.safeParse(raw);
  if (!resultado.success) {
    const linhas = resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Variáveis de ambiente inválidas:\n${linhas.join('\n')}`);
  }
  return resultado.data;
}

const UNIDADES_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

export function duracaoParaMs(duracao: string): number {
  const unidade = duracao.slice(-1) as keyof typeof UNIDADES_MS;
  return Number(duracao.slice(0, -1)) * UNIDADES_MS[unidade];
}
