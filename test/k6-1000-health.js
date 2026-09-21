import {
  check,
  sleep,
} from 'k6';
import http from 'k6/http';

export const options = {
  stages: [
    { duration: '15s', target: 100 },
    { duration: '15s', target: 250 },
    { duration: '15s', target: 500 },
    { duration: '20s', target: 750 },
    { duration: '30s', target: 1000 },
    { duration: '30s', target: 1000 },
    { duration: '15s', target: 0 }
  ],

  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: [
      'p(95)<1000',
      'p(99)<2000'
    ]
  }
};

export default function () {

  const res = http.get(
    'http://localhost:3000/api/health'
  );

  check(res, {
    'HTTP 200': (r) => r.status === 200,
    'CCC responde': (r) =>
      r.json('ok') === true
  });

  sleep(1);
}