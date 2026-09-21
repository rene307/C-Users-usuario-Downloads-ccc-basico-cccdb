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

   IMPORTANTE:

   1000 usuarios virtuales NO significan
   1000 conexiones PostgreSQL.

   Node.js recibe las solicitudes y el pool administra
   cuántas consultas llegan simultáneamente a PostgreSQL.

   Para la prueba local dejamos 40 conexiones como
   valor predeterminado.

   Se puede modificar desde .env sin cambiar este archivo.
========================================================= */

function numeroPositivo(
  valor,
  valorPorDefecto
) {

  const numero =
    Number(valor);


  if (
    !Number.isFinite(numero) ||
    numero <= 0
  ) {

    return valorPorDefecto;

  }


  return Math.trunc(
    numero
  );

}


/*
   Máximo de conexiones simultáneas PostgreSQL.

   NO colocar:

   1000

   porque eso puede saturar PostgreSQL.

   Los usuarios adicionales esperan brevemente
   una conexión libre del pool.
*/

const poolMax =
  numeroPositivo(
    process.env.DB_POOL_MAX,
    40
  );


/*
   Tiempo máximo para establecer
   una nueva conexión PostgreSQL.
*/

const connectionTimeoutMillis =
  numeroPositivo(
    process.env.DB_CONNECTION_TIMEOUT_MS,
    10000
  );


/*
   Una conexión sin utilizar se libera
   después de este tiempo.
*/

const idleTimeoutMillis =
  numeroPositivo(
    process.env.DB_IDLE_TIMEOUT_MS,
    30000
  );


/*
   Si una consulta demora demasiado,
   Node deja de esperarla.

   Esto evita que una consulta trabada
   ocupe recursos indefinidamente.
*/

const queryTimeoutMillis =
  numeroPositivo(
    process.env.DB_QUERY_TIMEOUT_MS,
    15000
  );


/*
   PostgreSQL también cancela consultas
   excesivamente largas.

   Este valor protege la base de datos
   durante cargas grandes.
*/

const statementTimeoutMillis =
  numeroPositivo(
    process.env.DB_STATEMENT_TIMEOUT_MS,
    15000
  );


/* =========================================================
   SELECCIONAR CONEXIÓN
========================================================= */

let connectionString;


/*
   LOCAL

   CCC y CCC-BÁSICO trabajan sobre:

   ccc_db

   Se toma DATABASE_URL pero se fuerza
   exclusivamente el nombre de la base de datos.
*/

if (
  dbMode === 'local'
) {

  const databaseUrl =
    process.env.DATABASE_URL;


  if (
    !databaseUrl
  ) {

    throw new Error(
      'Falta DATABASE_URL en el archivo .env'
    );

  }


  const urlLocal =
    new URL(
      databaseUrl
    );


  /*
     IMPORTANTE:

     Aunque DATABASE_URL termine accidentalmente en:

     /postgres

     CCC-BÁSICO utilizará:

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

   Esto permite mantener completamente
   independiente PostgreSQL local
   de PostgreSQL Supabase.
*/

else if (
  dbMode === 'supabase'
) {

  connectionString =
    process.env.SUPABASE_DATABASE_URL;

}


/*
   Evitamos levantar CCC con
   un modo incorrecto.
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

if (
  !connectionString
) {

  if (
    dbMode === 'local'
  ) {

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
  )
    .trim()
    .toLowerCase() === 'true';


/* =========================================================
   CREAR POOL POSTGRESQL
========================================================= */

const pool =
  new Pool({

    connectionString,


    /*
       Modelo maestro:

       public

       DB_SCHEMA continúa configurable
       desde .env.
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
       =====================================================
       CONTROL DEL POOL
       =====================================================

       max:
       conexiones PostgreSQL simultáneas.

       1000 usuarios pueden compartir
       estas conexiones.
    */

    max:
      poolMax,


    /*
       Cuánto esperar para abrir
       una conexión.
    */

    connectionTimeoutMillis:
      connectionTimeoutMillis,


    /*
       Cuánto mantener una conexión
       sin utilizar.
    */

    idleTimeoutMillis:
      idleTimeoutMillis,


    /*
       Máximo que Node espera
       el resultado de una consulta.
    */

    query_timeout:
      queryTimeoutMillis,


    /*
       Máximo que PostgreSQL permite
       ejecutar una consulta.
    */

    statement_timeout:
      statementTimeoutMillis

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
   INFORMACIÓN DEL POOL

   Estas propiedades NO crean conexiones nuevas.

   Solo permiten consultar cómo está configurado CCC.
========================================================= */

pool.schema =
  schema;

pool.dbMode =
  dbMode;

pool.poolMax =
  poolMax;


/* =========================================================
   MONITOREO DEL POOL

   Sirve para pruebas k6.

   Podemos revisar:

   totalCount:
   conexiones creadas.

   idleCount:
   conexiones libres.

   waitingCount:
   solicitudes esperando una conexión.

   NO imprime permanentemente.
   Solo deja disponible la función.
========================================================= */

pool.estadoPool =
  function () {

    return {

      modo:
        dbMode,

      maximo:
        poolMax,

      conexionesTotales:
        pool.totalCount,

      conexionesLibres:
        pool.idleCount,

      esperandoConexion:
        pool.waitingCount

    };

  };


/* =========================================================
   EXPORTAR
========================================================= */

module.exports =
  pool;