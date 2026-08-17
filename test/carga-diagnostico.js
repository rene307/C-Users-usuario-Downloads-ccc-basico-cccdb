import {
  check,
  sleep,
} from 'k6';
import http from 'k6/http';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const CORREO = __ENV.CORREO;
const PASSWORD = __ENV.PASSWORD;

// Mediremos cada parte por separado
const tiempoLogin = new Trend('tiempo_login', true);
const tiempoBodega = new Trend('tiempo_bodega', true);
const tiempoCocina = new Trend('tiempo_cocina', true);

export const options = {

    // PRIMERA PRUEBA: 25 usuarios simultáneos
    vus: 25,

    duration: '1m',

    thresholds: {

        http_req_failed: [
            'rate<0.01'
        ],

        tiempo_login: [
            'p(95)<800'
        ],

        tiempo_bodega: [
            'p(95)<800'
        ],

        tiempo_cocina: [
            'p(95)<800'
        ]

    }

};

let token = null;


function hacerLogin() {

    const respuesta = http.post(

        `${BASE_URL}/api/auth/login`,

        JSON.stringify({
            correo: CORREO,
            password: PASSWORD
        }),

        {
            headers: {
                'Content-Type': 'application/json'
            }
        }

    );

    tiempoLogin.add(
        respuesta.timings.duration
    );

    check(respuesta, {

        'LOGIN 200':
            (r) => r.status === 200

    });

    if (respuesta.status !== 200) {
        return null;
    }

    try {

        const datos = respuesta.json();

        return (
            datos.token ||
            datos.accessToken ||
            datos.access_token
        );

    } catch (error) {

        return null;

    }

}


export default function () {

    // Cada usuario inicia sesión una vez

    if (!token) {

        token = hacerLogin();

        if (!token) {

            sleep(1);

            return;

        }

    }


    const headers = {

        Authorization: `Bearer ${token}`

    };


    // =========================
    // BODEGA
    // =========================

    const bodega = http.get(

        `${BASE_URL}/api/bodega`,

        {
            headers: headers
        }

    );

    tiempoBodega.add(
        bodega.timings.duration
    );

    check(bodega, {

        'BODEGA 200':
            (r) => r.status === 200

    });


    sleep(1);


    // =========================
    // COCINA
    // =========================

    const cocina = http.get(

        `${BASE_URL}/api/cocina`,

        {
            headers: headers
        }

    );

    tiempoCocina.add(
        cocina.timings.duration
    );

    check(cocina, {

        'COCINA 200':
            (r) => r.status === 200

    });


    sleep(2);

}