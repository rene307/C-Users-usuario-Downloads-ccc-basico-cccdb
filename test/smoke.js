import {
  check,
  sleep,
} from 'k6';
import http from 'k6/http';

export const options = {
    vus: 1,
    duration: '10s'
};

export default function () {

    const respuesta = http.get(
        'http://localhost:3000/api/health'
    );

    check(respuesta, {
        'CCC responde 200': (r) => r.status === 200
    });

    sleep(1);
}