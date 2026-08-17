import {
  check,
  sleep,
} from 'k6';
import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const CORREO = __ENV.CORREO;
const PASSWORD = __ENV.PASSWORD;

export const options = {

    stages: [
        { duration: '30s', target: 5 },
        { duration: '30s', target: 10 },
        { duration: '30s', target: 25 },
        { duration: '30s', target: 50 },

        // Mantener 50 usuarios
        { duration: '1m', target: 50 },

        // Bajar
        { duration: '20s', target: 0 }
    ],

    thresholds: {

        // Menos de 1% de errores HTTP
        http_req_failed: [
            'rate<0.01'
        ],

        // 95% de las solicitudes bajo 800 ms
        http_req_duration: [
            'p(95)<800'
        ]

    }

};


// Cada VU mantiene su propio token
let token = null;


function login() {

    const respuesta = http.post(

        `${BASE_URL}/api/auth/login`,

        JSON.stringify({
            correo: CORREO,
            password: PASSWORD
        }),

        {
            headers: {
                'Content-Type': 'application/json'
            },
            tags: {
                endpoint: 'login'
            }
        }

    );


    const loginCorrecto = check(respuesta, {

        'LOGIN responde 200':
            (r) => r.status === 200,

        'LOGIN entrega token':
            (r) => {

                try {

                    const datos = r.json();

                    return Boolean(
                        datos.token ||
                        datos.accessToken ||
                        datos.access_token
                    );

                } catch (error) {

                    return false;

                }

            }

    });


    if (!loginCorrecto) {

        console.error(
            `Error login: ${respuesta.status} ${respuesta.body}`
        );

        return null;

    }


    const datos = respuesta.json();

    return (
        datos.token ||
        datos.accessToken ||
        datos.access_token
    );

}



export default function () {

    /*
       Cada usuario virtual inicia sesión
       una vez.
    */

    if (!token) {

        token = login();

        if (!token) {

            sleep(1);

            return;

        }

    }


    const headers = {

        Authorization: `Bearer ${token}`

    };


    /*
       =====================================
       BODEGA
       =====================================
    */

    const bodega = http.get(

        `${BASE_URL}/api/bodega`,

        {
            headers: headers,

            tags: {
                endpoint: 'bodega'
            }
        }

    );


    check(bodega, {

        'BODEGA responde 200':
            (r) => r.status === 200

    });


    /*
       Simula que el usuario mira la pantalla
    */

    sleep(1);


    /*
       =====================================
       COCINA
       =====================================
    */

    const cocina = http.get(

        `${BASE_URL}/api/cocina`,

        {
            headers: headers,

            tags: {
                endpoint: 'cocina'
            }
        }

    );


    check(cocina, {

        'COCINA responde 200':
            (r) => r.status === 200

    });


    /*
       Simulamos uso humano de la aplicación
    */

    sleep(2);

}