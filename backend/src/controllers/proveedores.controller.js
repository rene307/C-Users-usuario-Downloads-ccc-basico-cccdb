const pool = require('../config/db');


/* =========================================================
   FUNCIONES AUXILIARES
========================================================= */


/*
   Obtiene la empresa del usuario autenticado.
*/
function obtenerEmpresaId(req) {
  return Number(req.user?.empresa_id);
}


/*
   Normaliza nombres provenientes de boletas,
   facturas o aliases.

   Ejemplos:

   "Carne Vacuno"
   "CARNE VACUNO"
   "carne   vacuno"

   quedan comparables.
*/
function normalizarTexto(valor) {

  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}


/*
   Convierte a número de forma segura.
*/
function convertirNumero(valor) {

  const numero = Number(valor);

  return Number.isFinite(numero)
    ? numero
    : 0;
}



/* =========================================================
   LISTAR PROVEEDORES
   GET /api/proveedores
========================================================= */

async function listarProveedores(req, res) {

  try {

    const empresaId =
      obtenerEmpresaId(req);


    if (!empresaId) {

      return res.status(403).json({
        message: 'Usuario sin empresa asignada'
      });

    }


    /*
       Una fila representa la relación:

       proveedor
          ↓
       nombre de boleta
          ↓
       materia prima oficial

       Los aliases se devuelven como arreglo.
    */

    const result = await pool.query(
      `
      SELECT

        ppm.id,

        p.id AS proveedor_id,

        p.nombre AS proveedor,

        p.rut,

        p.contacto,

        p.telefono,

        p.correo,

        p.condicion_pago,

        p.estado AS proveedor_estado,

        ppm.nombre_boleta,

        ppm.unidad,

        ppm.ultimo_precio AS precio,

        ppm.estado,

        mp.id AS materia_prima_id,

        mp.nombre AS producto_maestro,

        COALESCE(
          ARRAY(
            SELECT pa.alias

            FROM public.proveedor_alias pa

            WHERE pa.empresa_id = ppm.empresa_id

              AND pa.proveedor_id =
                  ppm.proveedor_id

              AND pa.materia_prima_id =
                  ppm.materia_prima_id

            ORDER BY pa.alias
          ),
          ARRAY[]::varchar[]
        ) AS aliases

      FROM public.proveedor_materia_prima ppm

      INNER JOIN public.proveedores p

        ON p.id = ppm.proveedor_id

       AND p.empresa_id = ppm.empresa_id


      INNER JOIN public.materias_primas mp

        ON mp.id = ppm.materia_prima_id

       AND mp.empresa_id = ppm.empresa_id


      WHERE ppm.empresa_id = $1


      ORDER BY
        p.nombre ASC,
        ppm.nombre_boleta ASC
      `,
      [empresaId]
    );


    return res.json(
      result.rows
    );


  } catch (error) {

    console.error(
      'Error listarProveedores:',
      error
    );


    return res.status(500).json({

      message:
        'Error al listar proveedores',

      detalle:
        error.message

    });

  }

}



/* =========================================================
   GUARDAR PROVEEDOR
   POST /api/proveedores
========================================================= */

async function guardarProveedor(req, res) {

  const client =
    await pool.connect();


  try {

    const empresaId =
      obtenerEmpresaId(req);


    const {

      /*
         Datos del proveedor
      */
      proveedor,
      nombre,
      rut,
      contacto,
      telefono,
      correo,
      condicion_pago = 'Contado',
      estado = 'Activo',

      /*
         Relación con materia prima
      */
      materia_prima_id,
      producto_maestro,
      nombre_boleta,
      unidad,
      precio,

      /*
         Otros nombres que puede utilizar
         este mismo proveedor.
      */
      aliases = []

    } = req.body;


    /*
       Aceptamos:

       proveedor
       o
       nombre

       para mantener flexibilidad con el frontend.
    */

    const nombreProveedor =
      String(
        proveedor ||
        nombre ||
        ''
      ).trim();


    const nombreBoleta =
      String(
        nombre_boleta ||
        ''
      ).trim();


    const precioNumero =
      convertirNumero(precio);


    /* =====================================================
       VALIDACIONES
    ===================================================== */

    if (!empresaId) {

      return res.status(403).json({
        message:
          'Usuario sin empresa asignada'
      });

    }


    if (!nombreProveedor) {

      return res.status(400).json({
        message:
          'El nombre del proveedor es obligatorio'
      });

    }


    if (!nombreBoleta) {

      return res.status(400).json({
        message:
          'El nombre que aparece en la boleta es obligatorio'
      });

    }


    if (
      !materia_prima_id &&
      !producto_maestro
    ) {

      return res.status(400).json({
        message:
          'Debes seleccionar el producto maestro'
      });

    }


    if (precioNumero < 0) {

      return res.status(400).json({
        message:
          'El precio no puede ser negativo'
      });

    }


    await client.query('BEGIN');



    /* =====================================================
       1. BUSCAR LA MATERIA PRIMA OFICIAL
    ===================================================== */

    let materiaResult;


    /*
       Si en el futuro el frontend envía ID,
       lo utilizamos directamente.
    */

    if (materia_prima_id) {

      materiaResult =
        await client.query(
          `
          SELECT
            id,
            nombre,
            unidad,
            empresa_id

          FROM public.materias_primas

          WHERE id = $1
            AND empresa_id = $2

          LIMIT 1
          `,
          [
            Number(materia_prima_id),
            empresaId
          ]
        );

    }


    /*
       Actualmente tu frontend selecciona
       el nombre de Bodega.

       Por eso también aceptamos:

       producto_maestro = "Carne"
    */

    else {

      materiaResult =
        await client.query(
          `
          SELECT
            id,
            nombre,
            unidad,
            empresa_id

          FROM public.materias_primas

          WHERE empresa_id = $1

            AND LOWER(TRIM(nombre))
                =
                LOWER(TRIM($2))

          LIMIT 1
          `,
          [
            empresaId,
            producto_maestro
          ]
        );

    }


    if (
      materiaResult.rows.length === 0
    ) {

      await client.query('ROLLBACK');


      return res.status(404).json({
        message:
          'El producto maestro no existe en Bodega'
      });

    }


    const materiaPrima =
      materiaResult.rows[0];



    /* =====================================================
       2. BUSCAR / CREAR PROVEEDOR
    ===================================================== */

    let proveedorResult;


    /*
       Si existe RUT buscamos primero por RUT.
    */

    if (
      String(rut || '').trim()
    ) {

      proveedorResult =
        await client.query(
          `
          SELECT *

          FROM public.proveedores

          WHERE empresa_id = $1

            AND LOWER(TRIM(COALESCE(rut, '')))
                =
                LOWER(TRIM($2))

          LIMIT 1
          `,
          [
            empresaId,
            String(rut).trim()
          ]
        );

    }


    /*
       Si no lo encontramos por RUT,
       lo buscamos por nombre.
    */

    if (
      !proveedorResult ||
      proveedorResult.rows.length === 0
    ) {

      proveedorResult =
        await client.query(
          `
          SELECT *

          FROM public.proveedores

          WHERE empresa_id = $1

            AND LOWER(TRIM(nombre))
                =
                LOWER(TRIM($2))

          LIMIT 1
          `,
          [
            empresaId,
            nombreProveedor
          ]
        );

    }


    let proveedorGuardado;


    /* =====================================================
       2A. CREAR PROVEEDOR
    ===================================================== */

    if (
      proveedorResult.rows.length === 0
    ) {

      const insertProveedor =
        await client.query(
          `
          INSERT INTO public.proveedores
          (
            empresa_id,
            nombre,
            rut,
            contacto,
            telefono,
            correo,
            condicion_pago,
            estado
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8
          )

          RETURNING *
          `,
          [
            empresaId,
            nombreProveedor,
            String(rut || '').trim() || null,
            String(contacto || '').trim() || null,
            String(telefono || '').trim() || null,
            String(correo || '').trim() || null,
            condicion_pago || 'Contado',
            estado || 'Activo'
          ]
        );


      proveedorGuardado =
        insertProveedor.rows[0];

    }


    /* =====================================================
       2B. ACTUALIZAR PROVEEDOR EXISTENTE
    ===================================================== */

    else {

      const proveedorExistente =
        proveedorResult.rows[0];


      const updateProveedor =
        await client.query(
          `
          UPDATE public.proveedores

          SET

            nombre = $1,

            rut = $2,

            contacto = $3,

            telefono = $4,

            correo = $5,

            condicion_pago = $6,

            estado = $7,

            actualizado_en =
              CURRENT_TIMESTAMP

          WHERE id = $8
            AND empresa_id = $9

          RETURNING *
          `,
          [
            nombreProveedor,

            String(rut || '').trim()
              || proveedorExistente.rut,

            String(contacto || '').trim()
              || proveedorExistente.contacto,

            String(telefono || '').trim()
              || proveedorExistente.telefono,

            String(correo || '').trim()
              || proveedorExistente.correo,

            condicion_pago
              || proveedorExistente.condicion_pago
              || 'Contado',

            estado
              || proveedorExistente.estado
              || 'Activo',

            proveedorExistente.id,
            empresaId
          ]
        );


      proveedorGuardado =
        updateProveedor.rows[0];

    }



    /* =====================================================
       3. NORMALIZAR NOMBRE DE BOLETA
    ===================================================== */

    const nombreBoletaNormalizado =
      normalizarTexto(
        nombreBoleta
      );



    /* =====================================================
       4. REVISAR RELACIÓN EXISTENTE
    ===================================================== */

    const relacionExistente =
      await client.query(
        `
        SELECT *

        FROM public.proveedor_materia_prima

        WHERE empresa_id = $1

          AND proveedor_id = $2

          AND nombre_boleta_normalizado = $3

        LIMIT 1
        `,
        [
          empresaId,
          proveedorGuardado.id,
          nombreBoletaNormalizado
        ]
      );


    /*
       Regla importante:

       El mismo nombre de boleta de un proveedor
       NO puede apuntar a dos materias primas distintas.
    */

    if (
      relacionExistente.rows.length > 0 &&
      Number(
        relacionExistente.rows[0]
          .materia_prima_id
      ) !== Number(materiaPrima.id)
    ) {

      await client.query('ROLLBACK');


      return res.status(409).json({

        message:
          `"${nombreBoleta}" ya está relacionado ` +
          `con otra materia prima para este proveedor`

      });

    }



    let relacion;
    let precioAnterior = null;



    /* =====================================================
       5A. ACTUALIZAR RELACIÓN
    ===================================================== */

    if (
      relacionExistente.rows.length > 0
    ) {

      precioAnterior =
        Number(
          relacionExistente.rows[0]
            .ultimo_precio || 0
        );


      const updateRelacion =
        await client.query(
          `
          UPDATE public.proveedor_materia_prima

          SET

            materia_prima_id = $1,

            nombre_boleta = $2,

            nombre_boleta_normalizado = $3,

            unidad = $4,

            ultimo_precio = $5,

            estado = $6,

            actualizado_en =
              CURRENT_TIMESTAMP

          WHERE id = $7
            AND empresa_id = $8

          RETURNING *
          `,
          [
            materiaPrima.id,
            nombreBoleta,
            nombreBoletaNormalizado,
            String(unidad || '').trim()
              || materiaPrima.unidad,
            precioNumero,
            estado || 'Activo',
            relacionExistente.rows[0].id,
            empresaId
          ]
        );


      relacion =
        updateRelacion.rows[0];

    }



    /* =====================================================
       5B. CREAR RELACIÓN
    ===================================================== */

    else {

      const insertRelacion =
        await client.query(
          `
          INSERT INTO public.proveedor_materia_prima
          (
            empresa_id,
            proveedor_id,
            materia_prima_id,
            nombre_boleta,
            nombre_boleta_normalizado,
            unidad,
            ultimo_precio,
            estado
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8
          )

          RETURNING *
          `,
          [
            empresaId,
            proveedorGuardado.id,
            materiaPrima.id,
            nombreBoleta,
            nombreBoletaNormalizado,
            String(unidad || '').trim()
              || materiaPrima.unidad,
            precioNumero,
            estado || 'Activo'
          ]
        );


      relacion =
        insertRelacion.rows[0];

    }



    /* =====================================================
       6. GUARDAR ALIASES
    ===================================================== */

    const aliasesLimpios =
      Array.isArray(aliases)
        ? aliases
            .map(item =>
              String(item || '').trim()
            )
            .filter(Boolean)
        : [];


    for (
      const alias
      of aliasesLimpios
    ) {

      const aliasNormalizado =
        normalizarTexto(alias);


      /*
         Revisamos si ese alias ya existe
         para este proveedor.
      */

      const aliasExistente =
        await client.query(
          `
          SELECT *

          FROM public.proveedor_alias

          WHERE empresa_id = $1

            AND proveedor_id = $2

            AND alias_normalizado = $3

          LIMIT 1
          `,
          [
            empresaId,
            proveedorGuardado.id,
            aliasNormalizado
          ]
        );


      /*
         Si existe pero apunta a otro producto,
         no permitimos la ambigüedad.
      */

      if (
        aliasExistente.rows.length > 0 &&
        Number(
          aliasExistente.rows[0]
            .materia_prima_id
        ) !== Number(materiaPrima.id)
      ) {

        await client.query('ROLLBACK');


        return res.status(409).json({

          message:
            `El alias "${alias}" ya está relacionado ` +
            `con otra materia prima`

        });

      }


      /*
         Si no existe, se crea.
      */

      if (
        aliasExistente.rows.length === 0
      ) {

        await client.query(
          `
          INSERT INTO public.proveedor_alias
          (
            empresa_id,
            proveedor_id,
            materia_prima_id,
            alias,
            alias_normalizado
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5
          )
          `,
          [
            empresaId,
            proveedorGuardado.id,
            materiaPrima.id,
            alias,
            aliasNormalizado
          ]
        );

      }

    }



    /* =====================================================
       7. HISTORIAL DE PRECIOS
    ===================================================== */

    /*
       Solamente guardamos historial cuando:

       - el precio es mayor a cero
       - es una relación nueva
         o
       - cambió el precio
    */

    if (
      precioNumero > 0 &&
      (
        precioAnterior === null ||
        precioAnterior !== precioNumero
      )
    ) {

      await client.query(
        `
        INSERT INTO public.proveedor_historial_precio
        (
          empresa_id,
          proveedor_materia_prima_id,
          precio
        )

        VALUES
        (
          $1,
          $2,
          $3
        )
        `,
        [
          empresaId,
          relacion.id,
          precioNumero
        ]
      );

    }



    /* =====================================================
       8. CONFIRMAR
    ===================================================== */

    await client.query('COMMIT');



    return res
      .status(201)
      .json({

        message:
          'Proveedor guardado correctamente',

        id:
          Number(relacion.id),

        proveedor_id:
          Number(proveedorGuardado.id),

        proveedor:
          proveedorGuardado.nombre,

        rut:
          proveedorGuardado.rut,

        contacto:
          proveedorGuardado.contacto,

        telefono:
          proveedorGuardado.telefono,

        correo:
          proveedorGuardado.correo,

        nombre_boleta:
          relacion.nombre_boleta,

        materia_prima_id:
          Number(materiaPrima.id),

        producto_maestro:
          materiaPrima.nombre,

        unidad:
          relacion.unidad,

        precio:
          Number(
            relacion.ultimo_precio || 0
          ),

        estado:
          relacion.estado,

        aliases:
          aliasesLimpios

      });


  } catch (error) {

    await client.query(
      'ROLLBACK'
    );


    console.error(
      'Error guardarProveedor:',
      error
    );


    return res.status(500).json({

      message:
        'Error al guardar proveedor',

      detalle:
        error.message

    });


  } finally {

    client.release();

  }

}



/* =========================================================
   ACTUALIZAR PROVEEDOR
   PUT /api/proveedores/:id

   IMPORTANTE:
   :id corresponde a proveedor_materia_prima.id,
   que es el mismo id que devuelve listarProveedores().
========================================================= */

async function actualizarProveedor(req, res) {

  const client =
    await pool.connect();

  let transaccionIniciada = false;


  try {

    const empresaId =
      obtenerEmpresaId(req);

    const relacionId =
      Number(req.params.id);


    const {

      /*
         Datos del proveedor
      */
      proveedor,
      nombre,
      rut,
      contacto,
      telefono,
      correo,
      condicion_pago = 'Contado',
      estado = 'Activo',

      /*
         Relación con materia prima
      */
      materia_prima_id,
      producto_maestro,
      nombre_boleta,
      unidad,
      precio,

      /*
         Alias del producto para este proveedor
      */
      aliases = []

    } = req.body;


    /* =====================================================
       VALIDACIONES
    ===================================================== */

    if (!empresaId) {

      return res.status(403).json({
        message:
          'Usuario sin empresa asignada'
      });

    }


    if (
      !Number.isInteger(relacionId) ||
      relacionId <= 0
    ) {

      return res.status(400).json({
        message:
          'ID de proveedor inválido'
      });

    }


    const nombreProveedor =
      String(
        proveedor ||
        nombre ||
        ''
      ).trim();


    const nombreBoleta =
      String(
        nombre_boleta ||
        ''
      ).trim();


    const precioNumero =
      convertirNumero(precio);


    if (!nombreProveedor) {

      return res.status(400).json({
        message:
          'El nombre del proveedor es obligatorio'
      });

    }


    if (!nombreBoleta) {

      return res.status(400).json({
        message:
          'El nombre que aparece en la boleta es obligatorio'
      });

    }


    if (
      !materia_prima_id &&
      !producto_maestro
    ) {

      return res.status(400).json({
        message:
          'Debes seleccionar el producto maestro'
      });

    }


    if (precioNumero < 0) {

      return res.status(400).json({
        message:
          'El precio no puede ser negativo'
      });

    }


    await client.query('BEGIN');
    transaccionIniciada = true;


    /* =====================================================
       1. BUSCAR LA RELACIÓN QUE SE ESTÁ EDITANDO
    ===================================================== */

    const relacionActualResult =
      await client.query(
        `
        SELECT
          ppm.id,
          ppm.proveedor_id,
          ppm.materia_prima_id,
          ppm.nombre_boleta,
          ppm.nombre_boleta_normalizado,
          ppm.unidad,
          ppm.ultimo_precio,
          ppm.estado

        FROM public.proveedor_materia_prima ppm

        WHERE ppm.id = $1
          AND ppm.empresa_id = $2

        LIMIT 1
        `,
        [
          relacionId,
          empresaId
        ]
      );


    if (
      relacionActualResult.rows.length === 0
    ) {

      await client.query('ROLLBACK');
      transaccionIniciada = false;

      return res.status(404).json({
        message:
          'Proveedor no encontrado'
      });

    }


    const relacionActual =
      relacionActualResult.rows[0];

    const proveedorId =
      Number(
        relacionActual.proveedor_id
      );

    const materiaPrimaAnteriorId =
      Number(
        relacionActual.materia_prima_id
      );


    /* =====================================================
       2. BUSCAR LA MATERIA PRIMA OFICIAL
    ===================================================== */

    let materiaResult;


    if (materia_prima_id) {

      materiaResult =
        await client.query(
          `
          SELECT
            id,
            nombre,
            unidad,
            empresa_id

          FROM public.materias_primas

          WHERE id = $1
            AND empresa_id = $2

          LIMIT 1
          `,
          [
            Number(materia_prima_id),
            empresaId
          ]
        );

    }


    else {

      materiaResult =
        await client.query(
          `
          SELECT
            id,
            nombre,
            unidad,
            empresa_id

          FROM public.materias_primas

          WHERE empresa_id = $1

            AND LOWER(TRIM(nombre))
                =
                LOWER(TRIM($2))

          LIMIT 1
          `,
          [
            empresaId,
            producto_maestro
          ]
        );

    }


    if (
      materiaResult.rows.length === 0
    ) {

      await client.query('ROLLBACK');
      transaccionIniciada = false;

      return res.status(404).json({
        message:
          'El producto maestro no existe en Bodega'
      });

    }


    const materiaPrima =
      materiaResult.rows[0];


    /* =====================================================
       3. ACTUALIZAR DATOS GENERALES DEL PROVEEDOR
    ===================================================== */

    const proveedorActualizadoResult =
      await client.query(
        `
        UPDATE public.proveedores

        SET
          nombre = $1,
          rut = $2,
          contacto = $3,
          telefono = $4,
          correo = $5,
          condicion_pago = $6,
          estado = $7,
          actualizado_en =
            CURRENT_TIMESTAMP

        WHERE id = $8
          AND empresa_id = $9

        RETURNING *
        `,
        [
          nombreProveedor,
          String(rut || '').trim() || null,
          String(contacto || '').trim() || null,
          String(telefono || '').trim() || null,
          String(correo || '').trim() || null,
          condicion_pago || 'Contado',
          estado || 'Activo',
          proveedorId,
          empresaId
        ]
      );


    if (
      proveedorActualizadoResult.rows.length === 0
    ) {

      await client.query('ROLLBACK');
      transaccionIniciada = false;

      return res.status(404).json({
        message:
          'Proveedor no encontrado'
      });

    }


    const proveedorActualizado =
      proveedorActualizadoResult.rows[0];


    /* =====================================================
       4. VALIDAR EL NOMBRE DE BOLETA
    ===================================================== */

    const nombreBoletaNormalizado =
      normalizarTexto(
        nombreBoleta
      );


    const conflictoBoleta =
      await client.query(
        `
        SELECT
          id,
          materia_prima_id

        FROM public.proveedor_materia_prima

        WHERE empresa_id = $1
          AND proveedor_id = $2
          AND nombre_boleta_normalizado = $3
          AND id <> $4

        LIMIT 1
        `,
        [
          empresaId,
          proveedorId,
          nombreBoletaNormalizado,
          relacionId
        ]
      );


    if (
      conflictoBoleta.rows.length > 0
    ) {

      await client.query('ROLLBACK');
      transaccionIniciada = false;

      return res.status(409).json({
        message:
          `"${nombreBoleta}" ya pertenece a otro ` +
          'registro de este proveedor'
      });

    }


    const precioAnterior =
      Number(
        relacionActual.ultimo_precio || 0
      );


    /* =====================================================
       5. ACTUALIZAR RELACIÓN PROVEEDOR / MATERIA PRIMA
    ===================================================== */

    const relacionActualizadaResult =
      await client.query(
        `
        UPDATE public.proveedor_materia_prima

        SET
          materia_prima_id = $1,
          nombre_boleta = $2,
          nombre_boleta_normalizado = $3,
          unidad = $4,
          ultimo_precio = $5,
          estado = $6,
          actualizado_en =
            CURRENT_TIMESTAMP

        WHERE id = $7
          AND empresa_id = $8

        RETURNING *
        `,
        [
          materiaPrima.id,
          nombreBoleta,
          nombreBoletaNormalizado,
          String(unidad || '').trim()
            || materiaPrima.unidad,
          precioNumero,
          estado || 'Activo',
          relacionId,
          empresaId
        ]
      );


    if (
      relacionActualizadaResult.rows.length === 0
    ) {

      await client.query('ROLLBACK');
      transaccionIniciada = false;

      return res.status(404).json({
        message:
          'No se pudo actualizar la relación del proveedor'
      });

    }


    const relacionActualizada =
      relacionActualizadaResult.rows[0];


    /* =====================================================
       6. PREPARAR ALIASES
    ===================================================== */

    const aliasesLimpios =
      Array.isArray(aliases)
        ? aliases
            .map(item =>
              String(item || '').trim()
            )
            .filter(Boolean)
        : [];


    /*
       Primero quitamos los aliases de la relación
       que se estaba editando.

       Si cambió la materia prima, se eliminan de la
       materia prima anterior para que no queden alias
       antiguos apuntando al producto equivocado.
    */

    await client.query(
      `
      DELETE FROM public.proveedor_alias

      WHERE empresa_id = $1
        AND proveedor_id = $2
        AND materia_prima_id = $3
      `,
      [
        empresaId,
        proveedorId,
        materiaPrimaAnteriorId
      ]
    );


    /* =====================================================
       7. GUARDAR ALIASES ACTUALIZADOS
    ===================================================== */

    for (
      const alias
      of aliasesLimpios
    ) {

      const aliasNormalizado =
        normalizarTexto(alias);


      const aliasExistente =
        await client.query(
          `
          SELECT
            id,
            materia_prima_id

          FROM public.proveedor_alias

          WHERE empresa_id = $1
            AND proveedor_id = $2
            AND alias_normalizado = $3

          LIMIT 1
          `,
          [
            empresaId,
            proveedorId,
            aliasNormalizado
          ]
        );


      if (
        aliasExistente.rows.length > 0 &&
        Number(
          aliasExistente.rows[0]
            .materia_prima_id
        ) !== Number(
          materiaPrima.id
        )
      ) {

        await client.query('ROLLBACK');
        transaccionIniciada = false;

        return res.status(409).json({
          message:
            `El alias "${alias}" ya está relacionado ` +
            'con otra materia prima'
        });

      }


      if (
        aliasExistente.rows.length === 0
      ) {

        await client.query(
          `
          INSERT INTO public.proveedor_alias
          (
            empresa_id,
            proveedor_id,
            materia_prima_id,
            alias,
            alias_normalizado
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5
          )
          `,
          [
            empresaId,
            proveedorId,
            materiaPrima.id,
            alias,
            aliasNormalizado
          ]
        );

      }

    }


    /* =====================================================
       8. HISTORIAL DE PRECIOS
    ===================================================== */

    if (
      precioNumero > 0 &&
      precioAnterior !== precioNumero
    ) {

      await client.query(
        `
        INSERT INTO public.proveedor_historial_precio
        (
          empresa_id,
          proveedor_materia_prima_id,
          precio
        )

        VALUES
        (
          $1,
          $2,
          $3
        )
        `,
        [
          empresaId,
          relacionActualizada.id,
          precioNumero
        ]
      );

    }


    /* =====================================================
       9. CONFIRMAR CAMBIOS
    ===================================================== */

    await client.query('COMMIT');
    transaccionIniciada = false;


    return res.status(200).json({

      message:
        'Proveedor actualizado correctamente',

      id:
        Number(relacionActualizada.id),

      proveedor_id:
        Number(proveedorActualizado.id),

      proveedor:
        proveedorActualizado.nombre,

      rut:
        proveedorActualizado.rut,

      contacto:
        proveedorActualizado.contacto,

      telefono:
        proveedorActualizado.telefono,

      correo:
        proveedorActualizado.correo,

      condicion_pago:
        proveedorActualizado.condicion_pago,

      nombre_boleta:
        relacionActualizada.nombre_boleta,

      materia_prima_id:
        Number(materiaPrima.id),

      producto_maestro:
        materiaPrima.nombre,

      unidad:
        relacionActualizada.unidad,

      precio:
        Number(
          relacionActualizada.ultimo_precio || 0
        ),

      estado:
        relacionActualizada.estado,

      aliases:
        aliasesLimpios

    });


  } catch (error) {

    if (transaccionIniciada) {

      try {

        await client.query(
          'ROLLBACK'
        );

      } catch (rollbackError) {

        console.error(
          'Error haciendo ROLLBACK:',
          rollbackError
        );

      }

    }


    console.error(
      'Error actualizarProveedor:',
      error
    );


    return res.status(500).json({

      message:
        'Error al actualizar proveedor',

      detalle:
        error.message

    });


  } finally {

    client.release();

  }

}


/* =========================================================
   EXPORTAR
========================================================= */

module.exports = {

  listarProveedores,
  guardarProveedor,
  actualizarProveedor

};