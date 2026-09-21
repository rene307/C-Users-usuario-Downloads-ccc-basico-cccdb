import {
  check,
  sleep,
} from 'k6';
import http from 'k6/http';

const TOKEN = __ENV.CCC_TOKEN || '';

export const options = {
  stages: [
    { duration: '20s', target: 50 },
    { duration: '20s', target: 100 },
    { duration: '20s', target: 250 },
    { duration: '30s', target: 500 },
    { duration: '30s', target: 750 },
    { duration: '45s', target: 1000 },
    { duration: '45s', target: 1000 },
    { duration: '20s', target: 0 }
  ],

  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: [
      'p(95)<1500',
      'p(99)<3000'
    ]
  }
};

export default function () {

  if (!TOKEN) {
    throw new Error(
      'Falta CCC_TOKEN. Ejecuta k6 con -e CCC_TOKEN=TU_TOKEN'
    );
  }

  const params = {
    headers: {
      Authorization: `Bearer ${TOKEN}`
    }
  };

  const bodega = http.get(
    'http://localhost:3000/api/bodega',
    params
  );

  check(bodega, {
    'Bodega HTTP 200': (r) =>
      r.status === 200
  });

  sleep(1);
}