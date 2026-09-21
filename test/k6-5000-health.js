import {
  check,
  sleep,
} from 'k6';
import http from 'k6/http';

export const options = {

  stages: [

    // Subida progresiva
    { duration: '20s', target: 1000 },

    { duration: '20s', target: 2000 },

    { duration: '20s', target: 3000 },

    { duration: '20s', target: 4000 },

    { duration: '30s', target: 5000 },


    // Mantener 5000 usuarios concurrentes
    { duration: '60s', target: 5000 },


    // Bajada progresiva
    { duration: '20s', target: 2500 },

    { duration: '20s', target: 0 }

  ],


  thresholds: {

    /*
       Menos de 1% de errores HTTP.
    */

    http_req_failed: [
      'rate<0.01'
    ],


    /*
       95% de las respuestas
       deben estar bajo 1 segundo.

       99% bajo 2 segundos.
    */

    http_req_duration: [
      'p(95)<1000',
      'p(99)<2000'
    ]

  }

};


export default function () {

  const res =
    http.get(
      'http://localhost:3000/api/health'
    );


  check(
    res,
    {

      'HTTP 200':
        (r) =>
          r.status === 200,


      'CCC responde':
        (r) =>
          r.json('ok') === true

    }
  );


  /*
     Cada usuario espera 1 segundo
     antes de realizar otra solicitud.
  */

  sleep(1);

}