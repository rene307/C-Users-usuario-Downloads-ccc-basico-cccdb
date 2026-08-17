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
   SELECCIONAR CONEXIÓN
========================================================= */

let connectionString;


/*
   LOCAL

   Utilizamos DATABASE_URL porque actualmente
   tu proyecto ya trabaja con esa variable.
*/

if (dbMode === 'local') {

  connectionString =
    process.env.DATABASE_URL;

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

        : false

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



/* =========================================================
   EXPORTAR
========================================================= */

module.exports =
  pool;