// Teste de carga da página pública (Fase 5, seção 10.14). Não roda no CI.
// 1. docker compose -f docker-compose.carga.yml up -d
// 2. DATABASE_URL=postgres://tabloide:tabloide@localhost:55432/tabloide npm run db:migrate && npm run seed:carga
// 3. k6 run -e BASE=http://localhost:3300 -e CENARIO=quente test/carga/pagina-publica.k6.js
//    CENARIO: quente (500 req/s) | fria (100 req/s, subir a API com PUBLICO_CACHE_DESATIVADO=true)
//             | fila (1 código, 200 VUs juntos)
// O rate limit público (300/min por IP) fica alto no compose de carga; o cenário de 429 é
// conferido à parte, com PUBLICO_RATE_LIMIT_POR_MIN=300.
import http from 'k6/http';
import { check } from 'k6';

const CODIGOS = JSON.parse(open('./codigos.json'));
const CENARIO = __ENV.CENARIO || 'quente';

const CENARIOS = {
  quente: {
    executor: 'constant-arrival-rate',
    rate: 500,
    timeUnit: '1s',
    duration: '2m',
    preAllocatedVUs: 200,
  },
  fria: {
    executor: 'constant-arrival-rate',
    rate: 100,
    timeUnit: '1s',
    duration: '2m',
    preAllocatedVUs: 100,
  },
  // 200 pessoas na porta da loja abrindo a página ao mesmo tempo, com o cache vazio
  fila: { executor: 'per-vu-iterations', vus: 200, iterations: 1, maxDuration: '1m' },
};

const LIMITES = {
  quente: ['p(95)<50', 'p(99)<150'],
  fria: ['p(95)<200'],
  fila: ['p(95)<50'],
};

export const options = {
  scenarios: { [CENARIO]: { ...CENARIOS[CENARIO], tags: { cenario: CENARIO } } },
  thresholds: {
    [`http_req_duration{cenario:${CENARIO}}`]: LIMITES[CENARIO],
    http_req_failed: ['rate<0.001'],
  },
};

export default function () {
  // a fila usa o último código, que os outros cenários nunca carregam: mede o cache vazio
  // num processo já aquecido
  const codigo =
    CENARIO === 'fila'
      ? CODIGOS[CODIGOS.length - 1]
      : CODIGOS[Math.floor(Math.random() * (CODIGOS.length - 1))];
  const r = http.get(`${__ENV.BASE}/v1/publico/filiais/${codigo}`, {
    headers: { 'Accept-Encoding': 'gzip' },
    tags: { cenario: CENARIO },
  });
  check(r, {
    'status 200': (x) => x.status === 200,
    // o k6 descomprime o corpo; o tamanho com gzip (meta ≤ 30 KB) sai do Content-Length
    'gzip ≤ 30 KB': (x) =>
      x.headers['Content-Encoding'] === 'gzip' && Number(x.headers['Content-Length']) <= 30 * 1024,
  });
}
