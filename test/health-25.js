import {
  check,
  sleep,
} from 'k6';
import http from 'k6/http';

export const options = {
    vus: 25,
    duration: '30s',

    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<3000']
    }
};

export default function () {

    const respuesta = http.get(
        'http://localhost:3000/api/health'
    );

    check(respuesta, {
        'status es 200': (r) => r.status === 200,
        'respuesta menor a 3 segundos': (r) =>
            r.timings.duration < 3000
    });

    sleep(1);
}