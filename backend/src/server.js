require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');

const pool = require('./config/db');

const authRoutes = require('./routes/auth.routes');
const inventarioRoutes = require('./routes/inventario.routes');
const productosRoutes = require('./routes/productos.routes');
const ventasRoutes = require('./routes/ventas.routes');

// Rutas de proveedores
const proveedoresRoutes = require('./routes/proveedores.routes');

const app = express();

const PORT = Number(process.env.PORT || 3000);

/* =========================================================
   RUTAS ABSOLUTAS DEL FRONTEND
========================================================= */

const FRONTEND_DIR =
  path.resolve(
    __dirname,
    '../../frontend'
  );

const FRONTEND_INDEX =
  path.join(
    FRONTEND_DIR,
    'index.html'
  );

const FRONTEND_CSS =
  path.join(
    FRONTEND_DIR,
    'styles.css'
  );



/* =========================================================
   POSTGRESQL

   El modelo maestro de CCC está en el schema public.

   IMPORTANTE:
   Ya NO usamos:

   pool.on('connect', client => {
       client.query('SET search_path TO public')
   });

   porque PostgreSQL ya está trabajando directamente
   sobre el schema public.
========================================================= */


/* =========================================================
   MIDDLEWARE
========================================================= */

// Permite peticiones desde el frontend.
app.use(cors());

// Permite recibir JSON en las peticiones.
app.use(express.json());


/* =========================================================
   HEALTH
========================================================= */

/*
   IMPORTANTE PARA PRUEBAS DE CARGA:

   /api/health comprueba SOLO Node/Express.
   No consulta PostgreSQL.

   Esto evita que una prueba de 1000 usuarios virtuales
   convierta cada solicitud de salud en una consulta SQL.

   Para comprobar PostgreSQL usamos:
   /api/health/db
*/

app.get('/api/health', (req, res) => {

  return res.status(200).json({

    ok: true,

    message:
      'CCC Básico funcionando',

    servicio:
      'node-express',

    fecha:
      new Date().toISOString()

  });

});


/*
   HEALTH DE BASE DE DATOS

   Esta ruta sí comprueba PostgreSQL.
   Se mantiene separada del health liviano.
*/

app.get('/api/health/db', async (req, res) => {

  try {

    const db = await pool.query(`
      SELECT
        current_database() AS database,
        current_schema() AS schema,
        NOW() AS fecha
    `);


    return res.status(200).json({

      ok: true,

      message:
        'PostgreSQL funcionando',

      database:
        db.rows[0].database,

      schema:
        db.rows[0].schema,

      fecha:
        db.rows[0].fecha

    });


  } catch (error) {

    console.error(
      'Error comprobando PostgreSQL:',
      error
    );


    return res.status(503).json({

      ok: false,

      message:
        'PostgreSQL no disponible',

      detalle:
        error.message

    });

  }

});


/* =========================================================
   TEST BASE DE DATOS
========================================================= */

/*
   Segunda ruta de prueba de PostgreSQL.

   URL:
   http://localhost:3000/api/test-db
*/

app.get('/api/test-db', async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT
        NOW() AS fecha,
        current_database() AS database,
        current_schema() AS schema
    `);


    res.json({

      ok: true,

      database:
        result.rows[0].database,

      schema:
        result.rows[0].schema,

      fecha:
        result.rows[0].fecha

    });


  } catch (error) {

    console.error(
      'Error conectando a PostgreSQL:',
      error
    );


    res.status(500).json({

      ok: false,

      error:
        'No se pudo conectar a PostgreSQL',

      detalle:
        error.message

    });

  }

});


/* =========================================================
   RUTAS API
========================================================= */


/* ---------------------------------------------------------
   AUTENTICACIÓN

   Estas rutas vienen desde:

   backend/src/routes/auth.routes.js

   Y quedan disponibles como:

   POST /api/auth/login
   POST /api/auth/register
--------------------------------------------------------- */

/* =========================================================
   SEGURIDAD LOGIN - RATE LIMIT
========================================================= */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    ok: false,
    message: 'Demasiados intentos. Intenta nuevamente en 15 minutos.'
  }
});

app.use(
  '/api/auth/login',
  loginLimiter
);


app.use(
  '/api/auth',
  authRoutes
);


/* ---------------------------------------------------------
   INVENTARIO

   Aquí están las rutas de:

   - Bodega
   - Cocina
--------------------------------------------------------- */

app.use(
  '/api',
  inventarioRoutes
);


/* ---------------------------------------------------------
   PRODUCTOS

   Aquí están las rutas relacionadas con:

   - Productos
   - Recetas
--------------------------------------------------------- */

app.use(
  '/api',
  productosRoutes
);


/* ---------------------------------------------------------
   VENTAS

   Aquí están las rutas relacionadas con:

   - Ventas
   - Detalle de ventas / pedidos
--------------------------------------------------------- */

app.use(
  '/api',
  ventasRoutes
);


/* ---------------------------------------------------------
   PROVEEDORES

   Aquí están las rutas relacionadas con:

   - Proveedores
   - Relación proveedor / materia prima
   - Aliases
   - Historial de precios
--------------------------------------------------------- */

app.use(
  '/api',
  proveedoresRoutes
);


/* =========================================================
   ADMINISTRADOR DE DESARROLLO
========================================================= */

/*
   Este usuario solamente se crea si no existe.

   Los datos vienen desde .env:

   ADMIN_NAME
   ADMIN_EMAIL
   ADMIN_PASSWORD
   ADMIN_EMPRESA_NAME

   El administrador pertenece a una empresa mediante
   empresa_id.
*/

async function crearAdminSiNoExiste() {

  const adminEmail =
    process.env.ADMIN_EMAIL ||
    'admin@ccc.cl';


  const adminPassword =
    process.env.ADMIN_PASSWORD ||
    '123456';


  const adminName =
    process.env.ADMIN_NAME ||
    'Administrador';


  const empresaNombre =
    process.env.ADMIN_EMPRESA_NAME ||
    'CCC Empresa Demo';



  /* -------------------------------------------------------
     1. BUSCAR USUARIO
  ------------------------------------------------------- */

  /*
     Primero comprobamos si el administrador ya existe.

     Se usa LOWER() para evitar problemas entre:

     admin@ccc.cl
     ADMIN@CCC.CL
     Admin@ccc.cl
  */

  const usuarioExistente =
    await pool.query(
      `
      SELECT
        id,
        empresa_id

      FROM public.usuarios

      WHERE LOWER(email) = LOWER($1)

      LIMIT 1
      `,
      [
        adminEmail
      ]
    );



  /*
     Si el usuario ya existe,
     no hacemos INSERT nuevamente.
  */

  if (
    usuarioExistente.rows.length > 0
  ) {

    console.log(
      `Usuario admin existente: ${adminEmail}`
    );

    return;

  }



  /* -------------------------------------------------------
     2. BUSCAR EMPRESA DE DESARROLLO
  ------------------------------------------------------- */

  /*
     Cada usuario debe pertenecer a una empresa.

     Por eso primero buscamos la empresa demo.
  */

  let empresaResult =
    await pool.query(
      `
      SELECT
        id

      FROM public.empresas

      WHERE nombre = $1

      ORDER BY id

      LIMIT 1
      `,
      [
        empresaNombre
      ]
    );


  let empresaId;



  /* -------------------------------------------------------
     3. SI NO EXISTE EMPRESA, CREARLA
  ------------------------------------------------------- */

  if (
    empresaResult.rows.length === 0
  ) {

    empresaResult =
      await pool.query(
        `
        INSERT INTO public.empresas
        (
          nombre,
          activo,
          plan,
          creado_en
        )

        VALUES
        (
          $1,
          TRUE,
          'basico',
          CURRENT_TIMESTAMP
        )

        RETURNING id
        `,
        [
          empresaNombre
        ]
      );


    empresaId =
      empresaResult.rows[0].id;


    console.log(
      `Empresa de desarrollo creada: ${empresaNombre}`
    );

  } else {

    /*
       Si la empresa ya existe,
       usamos su ID.
    */

    empresaId =
      empresaResult.rows[0].id;

  }



  /* -------------------------------------------------------
     4. CREAR CONTRASEÑA
  ------------------------------------------------------- */

  /*
     Nunca guardamos la contraseña directamente.

     bcrypt genera el hash que se guarda en:

     usuarios.password_hash
  */

  const hash =
    await bcrypt.hash(
      adminPassword,
      10
    );



  /* -------------------------------------------------------
     5. CREAR ADMINISTRADOR
  ------------------------------------------------------- */

  /*
     IMPORTANTE:

     El rol correcto según la restricción
     chk_rol_usuario de PostgreSQL es:

     administrador

     NO:

     admin
     ADMIN
  */

  await pool.query(
    `
    INSERT INTO public.usuarios
    (
      nombre,
      email,
      password_hash,
      rol,
      activo,
      empresa_id,
      creado_en
    )

    VALUES
    (
      $1,
      $2,
      $3,
      'administrador',
      TRUE,
      $4,
      CURRENT_TIMESTAMP
    )
    `,
    [
      adminName,
      adminEmail,
      hash,
      empresaId
    ]
  );


  console.log(
    `Usuario admin creado: ${adminEmail}`
  );


  console.log(
    `Empresa ID: ${empresaId}`
  );

}


/* =========================================================
   FRONTEND
========================================================= */

/*
   Express también entrega directamente el frontend.

   La estructura es:

   backend/
   frontend/

   server.js está dentro de:

   backend/src/server.js

   Por eso debemos retroceder dos carpetas.
*/

/*
   Servimos styles.css de forma explícita.
   Así sabemos exactamente qué archivo está usando localhost:3000.
*/
app.get(
  '/styles.css',
  (req, res) => {

    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );

    res.setHeader(
      'Pragma',
      'no-cache'
    );

    res.setHeader(
      'Expires',
      '0'
    );

    res.sendFile(
      FRONTEND_CSS
    );

  }
);


/*
   Luego servimos normalmente el resto del frontend.
*/
app.use(
  express.static(
    FRONTEND_DIR,
    {
      etag: false,
      lastModified: false,

      setHeaders:
        (res, filePath) => {

          if (
            filePath.endsWith('.html') ||
            filePath.endsWith('.css') ||
            filePath.endsWith('.js')
          ) {

            res.setHeader(
              'Cache-Control',
              'no-store, no-cache, must-revalidate, proxy-revalidate'
            );

          }

        }
    }
  )
);


/* =========================================================
   API NO ENCONTRADA
========================================================= */

/*
   IMPORTANTE:

   Esta ruta debe estar después de las APIs reales.

   Evita que una URL como:

   /api/cualquier-cosa

   termine devolviendo index.html.
*/

app.use(
  '/api',
  (req, res) => {

    res.status(404).json({

      ok: false,

      error:
        'Ruta API no encontrada'

    });

  }
);


/* =========================================================
   SPA / FRONTEND
========================================================= */

/*
   Cualquier ruta que NO sea /api
   entrega index.html.

   Esto permite abrir normalmente CCC Básico desde:

   http://localhost:3000
*/

app.get(
  /.*/,
  (req, res) => {

    res.sendFile(
      FRONTEND_INDEX
    );

  }
);


/* =========================================================
   INICIAR SERVIDOR
========================================================= */

async function iniciarServidor() {

  try {

    /*
       Antes de levantar Express comprobamos
       que PostgreSQL realmente esté disponible.
    */

    const dbInfo =
      await pool.query(`
        SELECT
          current_database() AS database,
          current_schema() AS schema
      `);


    console.log(
      `Conexión PostgreSQL correcta: ` +
      `BD=${dbInfo.rows[0].database}, ` +
      `schema=${dbInfo.rows[0].schema}`
    );


    /*
       IMPORTANTE:

       Ya NO ejecutamos initDatabase().

       Las tablas maestras de CCC ya existen
       dentro del schema public.

       PostgreSQL local es nuestro modelo maestro.
    */


    /*
       Comprueba que exista el administrador
       de desarrollo.
    */

    await crearAdminSiNoExiste();


    /*
       Finalmente levantamos el servidor.
    */

    const servidor = app.listen(
      PORT,
      () => {

        console.log(
          `Servidor CCC Básico en http://localhost:${PORT}`
        );

        console.log(
          'FRONTEND REAL:',
          FRONTEND_DIR
        );

        console.log(
          'CSS REAL:',
          FRONTEND_CSS
        );

        console.log(
          `Login: POST http://localhost:${PORT}/api/auth/login`
        );

        console.log(
          `Registro: POST http://localhost:${PORT}/api/auth/register`
        );

        console.log(
          `Health Node: GET http://localhost:${PORT}/api/health`
        );

        console.log(
          `Health PostgreSQL: GET http://localhost:${PORT}/api/health/db`
        );

      }
    );


    /*
       Ajustes HTTP conservadores para conexiones persistentes.
       NO crean 1000 conexiones a PostgreSQL.
    */

    servidor.keepAliveTimeout = 65 * 1000;

    servidor.headersTimeout = 66 * 1000;

    servidor.requestTimeout = 30 * 1000;


  } catch (error) {

    console.error(
      'No se pudo iniciar el servidor:',
      error
    );


    process.exit(1);

  }

}


/* =========================================================
   EJECUTAR
========================================================= */

iniciarServidor();