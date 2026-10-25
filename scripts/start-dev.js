// Sobe a API em watch escolhendo o arquivo de ambiente: .env (Supabase) ou .env.debug (Docker local).
// Uso: npm run start:dev [-- prod|debug]; sem argumento, pergunta no terminal.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const readline = require('node:readline/promises');
const { parseEnv } = require('node:util');

const OPCOES = {
  prod: { arquivo: '.env', descricao: 'Supabase' },
  debug: { arquivo: '.env.debug', descricao: 'Docker local' },
};

async function escolher() {
  const arg = process.argv[2];
  if (arg) {
    if (!OPCOES[arg]) throw new Error(`opção inválida "${arg}"; use prod ou debug`);
    return arg;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Ambiente:\n  1) .env (prod, Supabase)\n  2) .env.debug (local, Docker)');
  const resposta = (await rl.question('Escolha [2]: ')).trim();
  rl.close();
  if (resposta === '1' || resposta === 'prod') return 'prod';
  if (resposta === '' || resposta === '2' || resposta === 'debug') return 'debug';
  throw new Error(`opção inválida "${resposta}"`);
}

async function main() {
  const { arquivo, descricao } = OPCOES[await escolher()];
  if (!fs.existsSync(arquivo)) throw new Error(`${arquivo} não encontrado`);
  console.log(`Usando ${arquivo} (${descricao})`);

  // process.env tem precedência sobre o .env lido pelo ConfigModule
  const env = { ...process.env, ...parseEnv(fs.readFileSync(arquivo, 'utf8')) };
  const nest = spawn('npx', ['nest', 'start', '--watch'], { stdio: 'inherit', env });
  nest.on('exit', (codigo) => process.exit(codigo ?? 0));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
