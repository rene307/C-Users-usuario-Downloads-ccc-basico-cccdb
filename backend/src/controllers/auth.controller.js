const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


// =========================================================
// ⚠️ OJO - CHEF TEMPORAL
// ARCHIVO TEMPORAL PARA LA PRESENTACIÓN
//
// Usa la configuración:
// backend/src/config/acceso-chef-temporal.js
//
// CUANDO TERMINE LA PRESENTACIÓN:
// 1) borrar este require
// 2) borrar el bloque de login temporal
// 3) borrar acceso-chef-temporal.js
// =========================================================

const {
  CHEF_TEMPORAL,
  validarChefTemporal
} = require('../config/acceso-chef-temporal');

// =========================================================
// ⚠️ FIN OJO - CHEF TEMPORAL
// =========================================================


/* =========================================================
   CREAR TOKEN
========================================================= */

function crearToken(usuario) {

  return jwt.sign(
    {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      rol_id: usuario.rol_id,
      empresa_id: usuario.empresa_id
    },
    process.env.JWT_SECRET || 'ccc_clave_secreta_2026',
    {
      expiresIn: '8h'
    }
  );

}


/* =========================================================
   LOGIN
   POST /api/auth/login
========================================================= */

async function login(req, res) {

  try {

    const email = String(
      req.body.email ||
      req.body.correo ||
      ''
    )
      .trim()
      .toLowerCase();


    const password = String(
      req.body.password ||
      req.body.clave ||
      ''
    ).trim();


    if (!email || !password) {

      return res.status(400).json({
        ok: false,
        message: 'Correo y contraseña son obligatorios'
      });

    }


    // =====================================================
    // ⚠️ OJO - CHEF TEMPORAL
    // ACCESO EXCLUSIVO PARA LA DEMOSTRACIÓN DE CCC-BÁSICO
    //
    // Usuario: chef@ccc.local
    // Clave:   123456
    //
    // EL CHEF SOLO TIENE 3 ACCESOS:
    // 1. Bodega
    // 2. Cocina
    // 3. Receta
    //
    // NO TIENE ACCESO A:
    // - Resumen
    // - Ventas
    // - Proveedores
    // - Administración
    // - Otros módulos
    //
    // Este bloque se ejecuta ANTES de consultar PostgreSQL.
    // Por eso el acceso temporal no depende de la contraseña
    // guardada en la base de datos.
    //
    // BORRAR ESTE BLOQUE DESPUÉS DE LA PRESENTACIÓN.
    // =====================================================

    if (
      validarChefTemporal(
        email,
        password
      )
    ) {

      const token =
        crearToken(
          CHEF_TEMPORAL.usuario
        );


      return res.json({

        ok: true,

        message:
          'Login Chef temporal correcto',

        token,

        usuario: {

          ...CHEF_TEMPORAL.usuario,

          // SOLO ESTOS 3 MÓDULOS.
          modulosPermitidos: [
            'bodega',
            'cocina',
            'receta'
          ]

        }

      });

    }

    // =====================================================
    // ⚠️ FIN OJO - CHEF TEMPORAL
    // =====================================================


    const resultado = await pool.query(
      `
      SELECT
        u.id,
        u.nombre,
        u.email,
        u.password_hash,
        u.rol,
        u.rol_id,
        u.empresa_id,
        u.activo,
        e.nombre AS empresa_nombre

      FROM public.usuarios u

      LEFT JOIN public.empresas e
        ON e.id = u.empresa_id

      WHERE LOWER(u.email) = $1

      LIMIT 1
      `,
      [email]
    );


    if (resultado.rows.length === 0) {

      return res.status(401).json({
        ok: false,
        message: 'Usuario o contraseña incorrectos'
      });

    }


    const usuario = resultado.rows[0];


    if (usuario.activo === false) {

      return res.status(403).json({
        ok: false,
        message: 'Usuario desactivado'
      });

    }


    const passwordCorrecta =
      await bcrypt.compare(
        password,
        usuario.password_hash
      );


    if (!passwordCorrecta) {

      return res.status(401).json({
        ok: false,
        message: 'Usuario o contraseña incorrectos'
      });

    }


    const token =
      crearToken(usuario);


    return res.json({

      ok: true,

      message: 'Login correcto',

      token,

      usuario: {

        id:
          usuario.id,

        nombre:
          usuario.nombre,

        email:
          usuario.email,

        rol:
          usuario.rol,

        rol_id:
          usuario.rol_id,

        empresa_id:
          usuario.empresa_id,

        empresa_nombre:
          usuario.empresa_nombre

      }

    });


  } catch (error) {

    console.error(
      'Error login:',
      error
    );


    return res.status(500).json({

      ok: false,

      message:
        'Error al iniciar sesión',

      detalle:
        error.message

    });

  }

}


/* =========================================================
   REGISTRO CCC / CCC-BÁSICO

   POST /api/auth/register

   CREA:

   EMPRESA
      ↓
   obtiene empresa_id
      ↓
   USUARIO ADMINISTRADOR
      ↓
   usuario.empresa_id = empresa.id
========================================================= */

async function register(req, res) {

  let client;


  try {

    client =
      await pool.connect();


    /* =====================================================
       1. RECIBIR DATOS
    ===================================================== */

    const nombreUsuario = String(
      req.body.nombre ||
      req.body.nombreUsuario ||
      req.body.nombre_usuario ||
      ''
    ).trim();


    const email = String(
      req.body.email ||
      req.body.correo ||
      ''
    )
      .trim()
      .toLowerCase();


    const whatsapp = String(
      req.body.whatsapp ||
      req.body.telefono ||
      req.body.celular ||
      ''
    ).trim();


    const nombreEmpresa = String(
      req.body.nombreEmpresa ||
      req.body.nombre_empresa ||
      req.body.empresa ||
      req.body.nombreNegocio ||
      req.body.nombre_negocio ||
      ''
    ).trim();


    const rutEmpresa = String(
      req.body.rutEmpresa ||
      req.body.rut_empresa ||
      req.body.rut ||
      ''
    ).trim();


    const direccion = String(
      req.body.direccion ||
      ''
    ).trim();


    const password = String(
      req.body.password ||
      req.body.clave ||
      req.body.contrasena ||
      ''
    ).trim();


    const confirmarPassword = String(
      req.body.confirmarPassword ||
      req.body.confirmar_password ||
      req.body.confirmarClave ||
      req.body.confirmar_clave ||
      ''
    ).trim();



    /* =====================================================
       2. VALIDACIONES
    ===================================================== */

    if (
      !nombreUsuario ||
      !email ||
      !whatsapp ||
      !nombreEmpresa ||
      !rutEmpresa ||
      !password
    ) {

      return res.status(400).json({

        ok: false,

        message:
          'Nombre, correo, WhatsApp, empresa, RUT y contraseña son obligatorios'

      });

    }


    if (password.length < 6) {

      return res.status(400).json({

        ok: false,

        message:
          'La contraseña debe tener al menos 6 caracteres'

      });

    }


    if (
      confirmarPassword &&
      password !== confirmarPassword
    ) {

      return res.status(400).json({

        ok: false,

        message:
          'Las contraseñas no coinciden'

      });

    }



    /* =====================================================
       3. INICIAR TRANSACCIÓN
    ===================================================== */

    await client.query(
      'BEGIN'
    );



    /* =====================================================
       4. COMPROBAR CORREO
    ===================================================== */

    const usuarioExistente =
      await client.query(
        `
        SELECT
          id

        FROM public.usuarios

        WHERE LOWER(email) = $1

        LIMIT 1
        `,
        [
          email
        ]
      );


    if (
      usuarioExistente.rows.length > 0
    ) {

      await client.query(
        'ROLLBACK'
      );


      return res.status(409).json({

        ok: false,

        message:
          'Ya existe un usuario registrado con ese correo'

      });

    }



    /* =====================================================
       5. LEER COLUMNAS DE EMPRESAS

       CCC y CCC-Básico utilizan la misma tabla:
       public.empresas

       Esto permite adaptarnos si el RUT se llama:

       rut

       o

       rut_empresa
    ===================================================== */

    const columnasEmpresaResultado =
      await client.query(
        `
        SELECT
          column_name

        FROM information_schema.columns

        WHERE table_schema = 'public'
          AND table_name = 'empresas'
        `
      );


    const columnasEmpresa =
      columnasEmpresaResultado.rows.map(
        fila => fila.column_name
      );


    /*
       Determinamos cuál columna usa actualmente
       la tabla empresas para guardar el RUT.
    */

    let columnaRut = null;


    if (
      columnasEmpresa.includes('rut')
    ) {

      columnaRut = 'rut';

    } else if (
      columnasEmpresa.includes('rut_empresa')
    ) {

      columnaRut = 'rut_empresa';

    }



    /* =====================================================
       6. VERIFICAR RUT DUPLICADO

       Solo se realiza si existe una columna de RUT.
    ===================================================== */

    if (columnaRut) {

      const empresaRutExistente =
        await client.query(
          `
          SELECT
            id

          FROM public.empresas

          WHERE
            REGEXP_REPLACE(
              LOWER(${columnaRut}),
              '[^0-9k]',
              '',
              'g'
            )
            =
            REGEXP_REPLACE(
              LOWER($1),
              '[^0-9k]',
              '',
              'g'
            )

          LIMIT 1
          `,
          [
            rutEmpresa
          ]
        );


      if (
        empresaRutExistente.rows.length > 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({

          ok: false,

          message:
            'Ya existe una empresa registrada con ese RUT'

        });

      }

    }



    /* =====================================================
       7. CREAR EMPRESA

       CCC-BÁSICO NO CREA OTRA BASE DE DATOS.

       Todo queda en:

       public.empresas

       Después cada empresa queda separada
       mediante empresa_id.
    ===================================================== */

    let empresaResultado;



    /* -----------------------------------------------------
       CASO 1

       Existe:

       rut o rut_empresa
       whatsapp
       direccion
    ----------------------------------------------------- */

    if (
      columnaRut &&
      columnasEmpresa.includes('whatsapp') &&
      columnasEmpresa.includes('direccion')
    ) {

      empresaResultado =
        await client.query(
          `
          INSERT INTO public.empresas
          (
            nombre,
            ${columnaRut},
            whatsapp,
            direccion,
            activo,
            plan,
            creado_en
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            TRUE,
            'basico',
            CURRENT_TIMESTAMP
          )

          RETURNING *
          `,
          [
            nombreEmpresa,
            rutEmpresa,
            whatsapp,
            direccion
          ]
        );

    }



    /* -----------------------------------------------------
       CASO 2

       La tabla usa telefono en vez de whatsapp.
    ----------------------------------------------------- */

    else if (
      columnaRut &&
      columnasEmpresa.includes('telefono') &&
      columnasEmpresa.includes('direccion')
    ) {

      empresaResultado =
        await client.query(
          `
          INSERT INTO public.empresas
          (
            nombre,
            ${columnaRut},
            telefono,
            direccion,
            activo,
            plan,
            creado_en
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            TRUE,
            'basico',
            CURRENT_TIMESTAMP
          )

          RETURNING *
          `,
          [
            nombreEmpresa,
            rutEmpresa,
            whatsapp,
            direccion
          ]
        );

    }



    /* -----------------------------------------------------
       CASO 3

       Tiene RUT pero no dirección.
    ----------------------------------------------------- */

    else if (
      columnaRut &&
      columnasEmpresa.includes('whatsapp')
    ) {

      empresaResultado =
        await client.query(
          `
          INSERT INTO public.empresas
          (
            nombre,
            ${columnaRut},
            whatsapp,
            activo,
            plan,
            creado_en
          )

          VALUES
          (
            $1,
            $2,
            $3,
            TRUE,
            'basico',
            CURRENT_TIMESTAMP
          )

          RETURNING *
          `,
          [
            nombreEmpresa,
            rutEmpresa,
            whatsapp
          ]
        );

    }



    /* -----------------------------------------------------
       CASO 4

       Tiene RUT + teléfono.
    ----------------------------------------------------- */

    else if (
      columnaRut &&
      columnasEmpresa.includes('telefono')
    ) {

      empresaResultado =
        await client.query(
          `
          INSERT INTO public.empresas
          (
            nombre,
            ${columnaRut},
            telefono,
            activo,
            plan,
            creado_en
          )

          VALUES
          (
            $1,
            $2,
            $3,
            TRUE,
            'basico',
            CURRENT_TIMESTAMP
          )

          RETURNING *
          `,
          [
            nombreEmpresa,
            rutEmpresa,
            whatsapp
          ]
        );

    }



    /* -----------------------------------------------------
       CASO 5

       La estructura mínima de CCC.

       nombre
       activo
       plan
       creado_en
    ----------------------------------------------------- */

    else {

      empresaResultado =
        await client.query(
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

          RETURNING *
          `,
          [
            nombreEmpresa
          ]
        );

    }



    const empresa =
      empresaResultado.rows[0];



    /* =====================================================
       8. BUSCAR ROL ADMINISTRADOR
    ===================================================== */

    const rolResultado =
      await client.query(
        `
        SELECT
          id,
          nombre

        FROM public.roles

        WHERE LOWER(nombre)
          IN (
            'administrador',
            'admin'
          )

        ORDER BY id

        LIMIT 1
        `
      );


    let rolId = null;


    if (
      rolResultado.rows.length > 0
    ) {

      rolId =
        rolResultado.rows[0].id;

    }



    /* =====================================================
       9. GENERAR PASSWORD HASH
    ===================================================== */

    const passwordHash =
      await bcrypt.hash(
        password,
        10
      );



    /* =====================================================
       10. CREAR ADMINISTRADOR

       empresa.id recién creado se guarda en:

       usuarios.empresa_id

       Esta relación es la que permite separar
       Pedro, Paula, GFAS, etc.
    ===================================================== */

    const usuarioResultado =
      await client.query(
        `
        INSERT INTO public.usuarios
        (
          nombre,
          email,
          password_hash,
          rol,
          rol_id,
          empresa_id,
          activo,
          creado_en
        )

        VALUES
        (
          $1,
          $2,
          $3,
          'administrador',
          $4,
          $5,
          TRUE,
          CURRENT_TIMESTAMP
        )

        RETURNING
          id,
          nombre,
          email,
          rol,
          rol_id,
          empresa_id,
          activo,
          creado_en
        `,
        [
          nombreUsuario,
          email,
          passwordHash,
          rolId,
          empresa.id
        ]
      );


    const usuario =
      usuarioResultado.rows[0];



    /* =====================================================
       11. CONFIRMAR TRANSACCIÓN
    ===================================================== */

    await client.query(
      'COMMIT'
    );



    /* =====================================================
       12. CREAR TOKEN

       El usuario puede entrar inmediatamente
       después del registro.
    ===================================================== */

    const token =
      crearToken(usuario);



    /* =====================================================
       13. RESPUESTA
    ===================================================== */

    return res.status(201).json({

      ok: true,

      message:
        'Empresa y usuario creados correctamente',

      token,

      empresa: {

        id:
          empresa.id,

        nombre:
          empresa.nombre,

        rut:
          empresa.rut ||
          empresa.rut_empresa ||
          rutEmpresa,

        whatsapp:
          empresa.whatsapp ||
          empresa.telefono ||
          whatsapp,

        direccion:
          empresa.direccion ||
          direccion,

        plan:
          empresa.plan ||
          'basico'

      },

      usuario: {

        id:
          usuario.id,

        nombre:
          usuario.nombre,

        email:
          usuario.email,

        rol:
          usuario.rol,

        rol_id:
          usuario.rol_id,

        empresa_id:
          usuario.empresa_id

      }

    });


  } catch (error) {

    /*
       Si ocurre cualquier error después del BEGIN,
       PostgreSQL revierte los cambios.
    */

    if (client) {

      try {

        await client.query(
          'ROLLBACK'
        );

      } catch (rollbackError) {

        console.error(
          'Error rollback:',
          rollbackError.message
        );

      }

    }


    console.error(
      'Error register:',
      error
    );


    return res.status(500).json({

      ok: false,

      message:
        'Error al registrar la empresa',

      detalle:
        error.message

    });


  } finally {

    if (client) {

      client.release();

    }

  }

}


/* =========================================================
   EXPORTAR
========================================================= */

module.exports = {

  login,
  register

};