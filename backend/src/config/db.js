const { Pool } = require('pg');

/* =========================================================
   MODO DE BASE DE DATOS

   DB_MODE puede ser:

   local
   supabase

   No cambia ninguna tabla ni controller.
   Solo cambia a qué PostgreSQL se conecta CCC.
========================================================= */

const dbMode =
  String(
    process.env.DB_MODE || 'local'
  )
    .trim()
    .toLowerCase();


const schema =
  String(
    process.env.DB_SCHEMA || 'public'
  )
    .trim();


/* =========================================================
   CONFIGURACIÓN DEL POOL

   Se deja configurable desde .env para poder comparar
   pruebas de carga sin modificar el código.
========================================================= */

function numeroPositivo(valor, valorPorDefecto) {
  const numero = Number(valor);

  if (!Number.isFinite(numero) || numero <= 0) {
    return valorPorDefecto;
  }

  return Math.trunc(numero);
}

const poolMax =
  numeroPositivo(
    process.env.DB_POOL_MAX,
    30
  );

const connectionTimeoutMillis =
  numeroPositivo(
    process.env.DB_CONNECTION_TIMEOUT_MS,
    5000
  );

const idleTimeoutMillis =
  numeroPositivo(
    process.env.DB_IDLE_TIMEOUT_MS,
    30000
  );


/* =========================================================
   SELECCIONAR CONEXIÓN
========================================================= */

let connectionString;


/*
   LOCAL

   CCC y CCC-BÁSICO deben trabajar sobre:

   ccc_db

   Se toma DATABASE_URL pero se fuerza exclusivamente
   el nombre de la base de datos a ccc_db.
*/

if (dbMode === 'local') {

  const databaseUrl =
    process.env.DATABASE_URL;


  if (!databaseUrl) {

    throw new Error(
      'Falta DATABASE_URL en el archivo .env'
    );

  }


  const urlLocal =
    new URL(databaseUrl);


  /*
     IMPORTANTE:

     No importa si accidentalmente DATABASE_URL termina en:

     /postgres

     CCC-BÁSICO siempre utilizará:

     /ccc_db
  */

  urlLocal.pathname =
    '/ccc_db';


  connectionString =
    urlLocal.toString();

}


/*
   SUPABASE

   Utilizamos una variable separada.

   Esto permite mantener la contraseña y conexión
   de Supabase sin tocar la conexión local.
*/

else if (dbMode === 'supabase') {

  connectionString =
    process.env.SUPABASE_DATABASE_URL;

}


/*
   Evitamos levantar CCC con un modo escrito incorrectamente.
*/

else {

  throw new Error(
    `DB_MODE inválido: "${dbMode}". ` +
    `Usa "local" o "supabase".`
  );

}


/* =========================================================
   VALIDAR CONNECTION STRING
========================================================= */

if (!connectionString) {

  if (dbMode === 'local') {

    throw new Error(
      'Falta DATABASE_URL en el archivo .env'
    );

  }


  throw new Error(
    'Falta SUPABASE_DATABASE_URL en el archivo .env'
  );

}


/* =========================================================
   SSL
========================================================= */

/*
   PostgreSQL local:

   SSL = false

   Supabase:

   SSL = true
*/

const usarSSL =
  dbMode === 'supabase' ||
  String(
    process.env.DB_SSL || ''
  ).toLowerCase() === 'true';


/* =========================================================
   CREAR POOL POSTGRESQL
========================================================= */

const pool =
  new Pool({

    connectionString,

    /*
       Nuestro modelo maestro trabaja en:

       public

       Se mantiene DB_SCHEMA para poder
       configurarlo desde .env si fuera necesario.
    */

    options:
      `-c search_path=${schema},public`,

    ssl:
      usarSSL

        ? {
            rejectUnauthorized: false
          }

        : false,

    /*
       Ajustes de rendimiento y control del pool.

       max: máximo de conexiones PostgreSQL simultáneas.
       connectionTimeoutMillis: cuánto esperar al abrir conexión.
       idleTimeoutMillis: cuánto mantener una conexión ociosa.
    */

    max:
      poolMax,

    connectionTimeoutMillis:
      connectionTimeoutMillis,

    idleTimeoutMillis:
      idleTimeoutMillis

  });


/* =========================================================
   MANEJO DE ERRORES DEL POOL
========================================================= */

pool.on(
  'error',
  error => {

    console.error(
      'Error inesperado en PostgreSQL:',
      error
    );

  }
);


/* =========================================================
   INFORMACIÓN DE CONEXIÓN

   Estas propiedades NO crean otra conexión.

   Solo permiten que otros archivos puedan saber
   qué modo y schema están activos.
========================================================= */

pool.schema =
  schema;

pool.dbMode =
  dbMode;

pool.poolMax =
  poolMax;


/* =========================================================
   EXPORTAR
========================================================= */

module.exports =
  pool;
