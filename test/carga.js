import {
  check,
  sleep,
} from 'k6';
import http from 'k6/http';

export const options = {
    stages: [
        { duration: '30s', target: 1 },
        { duration: '30s', target: 5 },
        { duration: '30s', target: 10 },
        { duration: '30s', target: 25 },
        { duration: '30s', target: 50 },

        // Mantiene 50 usuarios durante 1 minuto
        { duration: '1m', target: 50 },

        // Baja progresivamente a cero
        { duration: '20s', target: 0 }
    ],

    thresholds: {
        // Menos de 1% de errores
        http_req_failed: ['rate<0.01'],

        // 95% de las respuestas bajo 500 ms
        http_req_duration: ['p(95)<500']
    }
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