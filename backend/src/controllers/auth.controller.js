
'use strict';

const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// =========================================================
// CREAR TOKEN
// =========================================================

function crearToken(usuario) {
  if (!process.env.JWT_SECRET) {
    throw new Error(
      'Falta configurar JWT_SECRET en el servidor'
    );
  }

  return jwt.sign(
    {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      rol_id: usuario.rol_id,
      empresa_id: usuario.empresa_id
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '8h'
    }
  );
}

// =========================================================
// LOGIN - POST /api/auth/login
// =========================================================

async function login(req, res) {
  try {
    const email = String(
      req.body?.email ??
      req.body?.correo ??
      ''
    ).trim().toLowerCase();

    // Respetar la contraseña exacta.
    const password = String(
      req.body?.password ??
      req.body?.clave ??
      ''
    );

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        message: 'Correo y contraseña son obligatorios'
      });
    }

    // Chef temporal solo en desarrollo.
    // Deshabilitado en producción.
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.ENABLE_CHEF_TEMPORAL === 'true'
    ) {
      const {
        CHEF_TEMPORAL,
        validarChefTemporal
      } = require('../config/acceso-chef-temporal');

      if (validarChefTemporal(email, password)) {
        const token = crearToken(
          CHEF_TEMPORAL.usuario
        );

        return res.json({
          ok: true,
          message: 'Login Chef temporal correcto',
          token,
          usuario: {
            ...CHEF_TEMPORAL.usuario,
            modulosPermitidos: [
              'bodega',
              'cocina',
              'receta'
            ]
          }
        });
      }
    }

    // Buscar usuario en PostgreSQL.
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

    const passwordCorrecta = usuario.password_hash
      ? await bcrypt.compare(
          password,
          usuario.password_hash
        )
      : false;

    if (!passwordCorrecta) {
      return res.status(401).json({
        ok: false,
        message: 'Usuario o contraseña incorrectos'
      });
    }

    const token = crearToken(usuario);

    return res.json({
      ok: true,
      message: 'Login correcto',
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        rol_id: usuario.rol_id,
        empresa_id: usuario.empresa_id,
        empresa_nombre: usuario.empresa_nombre
      }
    });

  } catch (error) {
    console.error('Error login:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al iniciar sesión',
      ...(process.env.NODE_ENV !== 'production'
        ? { detalle: error.message }
        : {})
    });
  }
}

// =========================================================
// REGISTRO MULTIEMPRESA
// POST /api/auth/register
// =========================================================

async function register(req, res) {
  let client;

  try {
    // Validar antes de crear una empresa.
    if (!process.env.JWT_SECRET) {
      throw new Error(
        'Falta configurar JWT_SECRET en el servidor'
      );
    }

    client = await pool.connect();

    // 1. Recibir datos.
    const nombreUsuario = String(
      req.body?.nombre ??
      req.body?.nombreUsuario ??
      req.body?.nombre_usuario ??
      ''
    ).trim();

    const email = String(
      req.body?.email ??
      req.body?.correo ??
      ''
    ).trim().toLowerCase();

    const whatsapp = String(
      req.body?.whatsapp ??
      req.body?.telefono ??
      req.body?.celular ??
      ''
    ).trim();

    const nombreEmpresa = String(
      req.body?.nombreEmpresa ??
      req.body?.nombre_empresa ??
      req.body?.empresa ??
      req.body?.nombreNegocio ??
      req.body?.nombre_negocio ??
      ''
    ).trim();

    const rutEmpresa = String(
      req.body?.rutEmpresa ??
      req.body?.rut_empresa ??
      req.body?.rut ??
      ''
    ).trim();

    const direccion = String(
      req.body?.direccion ?? ''
    ).trim();

    const password = String(
      req.body?.password ??
      req.body?.clave ??
      req.body?.contrasena ??
      ''
    );

    const confirmarPassword = String(
      req.body?.confirmarPassword ??
      req.body?.confirmar_password ??
      req.body?.confirmarClave ??
      req.body?.confirmar_clave ??
      ''
    );

    // 2. Validaciones.
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
        message: 'Las contraseñas no coinciden'
      });
    }

    // 3. Iniciar transacción.
    await client.query('BEGIN');

    // 4. Comprobar correo duplicado.
    const usuarioExistente = await client.query(
      `
      SELECT id
      FROM public.usuarios
      WHERE LOWER(email) = $1
      LIMIT 1
      `,
      [email]
    );

    if (usuarioExistente.rows.length > 0) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        ok: false,
        message:
          'Ya existe un usuario registrado con ese correo'
      });
    }

    // 5. Reconocer estructura de empresas.
    const columnasEmpresaResultado = await client.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'empresas'
      `
    );

    const columnasEmpresa =
      columnasEmpresaResultado.rows.map(
        fila => fila.column_name
      );

    // Solo nombres de columna autorizados.
    const columnaRut = columnasEmpresa.includes('rut')
      ? 'rut'
      : columnasEmpresa.includes('rut_empresa')
        ? 'rut_empresa'
        : null;

    // 6. Verificar RUT duplicado.
    if (columnaRut) {
      const empresaRutExistente = await client.query(
        `
        SELECT id
        FROM public.empresas
        WHERE REGEXP_REPLACE(
          LOWER(${columnaRut}),
          '[^0-9k]', '', 'g'
        ) = REGEXP_REPLACE(
          LOWER($1),
          '[^0-9k]', '', 'g'
        )
        LIMIT 1
        `,
        [rutEmpresa]
      );

      if (empresaRutExistente.rows.length > 0) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          ok: false,
          message:
            'Ya existe una empresa registrada con ese RUT'
        });
      }
    }

    // 7. Crear empresa.
    let empresaResultado;

    // Caso 1: RUT, WhatsApp y dirección.
    if (
      columnaRut &&
      columnasEmpresa.includes('whatsapp') &&
      columnasEmpresa.includes('direccion')
    ) {
      empresaResultado = await client.query(
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
          $1, $2, $3, $4,
          TRUE, 'basico', CURRENT_TIMESTAMP
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

    // Caso 2: RUT, teléfono y dirección.
    else if (
      columnaRut &&
      columnasEmpresa.includes('telefono') &&
      columnasEmpresa.includes('direccion')
    ) {
      empresaResultado = await client.query(
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
          $1, $2, $3, $4,
          TRUE, 'basico', CURRENT_TIMESTAMP
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

    // Caso 3: RUT y WhatsApp.
    else if (
      columnaRut &&
      columnasEmpresa.includes('whatsapp')
    ) {
      empresaResultado = await client.query(
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
          $1, $2, $3,
          TRUE, 'basico', CURRENT_TIMESTAMP
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

    // Caso 4: RUT y teléfono.
    else if (
      columnaRut &&
      columnasEmpresa.includes('telefono')
    ) {
      empresaResultado = await client.query(
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
          $1, $2, $3,
          TRUE, 'basico', CURRENT_TIMESTAMP
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

    // Caso 5: estructura básica.
    else {
      empresaResultado = await client.query(
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
        [nombreEmpresa]
      );
    }

    const empresa = empresaResultado.rows[0];

    // 8. Buscar rol administrador.
    const rolResultado = await client.query(
      `
      SELECT id, nombre
      FROM public.roles
      WHERE LOWER(nombre) IN (
        'administrador',
        'admin'
      )
      ORDER BY id
      LIMIT 1
      `
    );

    const rolId = rolResultado.rows.length > 0
      ? rolResultado.rows[0].id
      : null;

    // 9. Cifrar contraseña.
    const passwordHash = await bcrypt.hash(
      password,
      10
    );

    // 10. Crear usuario asociado a la empresa.
    const usuarioResultado = await client.query(
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

    const usuario = usuarioResultado.rows[0];

    // 11. Confirmar transacción.
    await client.query('COMMIT');

    // 12. Crear token.
    const token = crearToken(usuario);

    // 13. Respuesta al frontend.
    return res.status(201).json({
      ok: true,
      message:
        'Empresa y usuario creados correctamente',

      token,

      empresa: {
        id: empresa.id,
        nombre: empresa.nombre,
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
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        rol_id: usuario.rol_id,
        empresa_id: usuario.empresa_id
      }
    });

  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(
          'Error rollback:',
          rollbackError.message
        );
      }
    }

    console.error('Error register:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al registrar la empresa',
      ...(process.env.NODE_ENV !== 'production'
        ? { detalle: error.message }
        : {})
    });

  } finally {
    if (client) {
      client.release();
    }
  }
}

// =========================================================
// EXPORTACIONES
// =========================================================

module.exports = {
  login,
  register
};
