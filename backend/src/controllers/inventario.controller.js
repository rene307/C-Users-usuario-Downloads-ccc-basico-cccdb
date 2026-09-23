const pool = require('../config/db');


/* =========================================================
   FUNCIONES AUXILIARES
========================================================= */

/*
   Obtiene empresa_id desde el JWT.

   Este dato fue guardado durante el login.

   Es fundamental porque todas las empresas comparten
   las mismas tablas, pero cada una solamente puede
   trabajar con sus propios registros.
*/
function obtenerEmpresaId(req) {
  return Number(req.user?.empresa_id);
}


/*
   Convierte un valor a número.
*/
function convertirNumero(valor) {
  const numero = Number(valor);

  return Number.isFinite(numero)
    ? numero
    : NaN;
}


/*
   Convierte textos como:

   "200 g"
   "200 gr"
   "250 gramos"

   a:

   200
   200
   250
*/
function extraerGramos(valor) {

  const resultado = String(valor || '')
    .replace(',', '.')
    .match(/[0-9]+(?:\.[0-9]+)?/);

  if (!resultado) {
    return 0;
  }

  return Number(resultado[0]);
}

/*
   CCC-Básico también permite materias primas
   manejadas por unidad.

   No se modifica la estructura de la base de datos:
   tipo_porcion.gramos y porciones.gramos siguen
   guardando el valor numérico de la medida.

   La diferencia visual se obtiene desde
   materias_primas.unidad:

   - kg / g     -> "300 g"
   - unidad     -> "1 unidad", "6 unidades", etc.
*/
function esUnidadPorPieza(valor) {

  const unidad =
    String(valor || '')
      .trim()
      .toLowerCase();

  return [
    'unidad',
    'unidades',
    'u',
    'und',
    'uds',
    'unid'
  ].includes(unidad);

}



/*
   =========================================================
   PALABRA CLAVE PARA BEBESTIBLES
   =========================================================

   La regla solicitada para CCC-Básico es simple:

   El nombre registrado en Bodega debe comenzar con:

   bebestible

   Ejemplos válidos:

   bebestible Fanta
   bebestible Coca Cola
   bebestible jugo de naranja
   bebestible agua sin gas

   Esta palabra clave permite distinguir un bebestible de
   otros productos que también pueden manejarse por unidad,
   como Pan de completo o Vienesa, que SÍ requieren receta.

   No se agrega ninguna columna nueva a la base de datos.
*/
function esBebestible(nombre) {

  const texto =
    String(nombre || '')
      .trim()
      .toLowerCase();

  return (
    texto === 'bebestible' ||
    texto.startsWith('bebestible ')
  );

}


function formatearUnidadCocina(
  medida,
  unidadBodega
) {

  const numeroMedida =
    Number(medida);

  if (
    esUnidadPorPieza(
      unidadBodega
    )
  ) {

    return numeroMedida === 1
      ? '1 unidad'
      : `${numeroMedida} unidades`;

  }

  return `${numeroMedida} g`;

}




/* =========================================================
   BODEGA
   TABLA MAESTRA:
   public.materias_primas
========================================================= */


/* =========================================================
   LISTAR BODEGA
   GET /api/bodega
========================================================= */

async function listarBodega(req, res) {

  try {

    const empresaId = obtenerEmpresaId(req);


    if (!empresaId) {

      return res.status(403).json({
        message: 'Usuario sin empresa asignada'
      });

    }


    /*
       La base maestra utiliza:

       materias_primas.nombre
       materias_primas.cantidad_total

       Pero CCC-Básico espera:

       nombre_producto
       cantidad

       Por eso usamos AS.
    */

    const result = await pool.query(
      `
      SELECT

        id,

        nombre
          AS nombre_producto,

        unidad,

        cantidad_total
          AS cantidad,

        costo_total,

        creado_en,

        empresa_id

      FROM public.materias_primas

      WHERE empresa_id = $1

      ORDER BY id DESC
      `,
      [empresaId]
    );


    return res.json(result.rows);


  } catch (error) {

    console.error(
      'Error listarBodega:',
      error
    );


    return res.status(500).json({
      message: 'Error al listar bodega',
      detalle: error.message
    });

  }

}



/* =========================================================
   CREAR PRODUCTO BODEGA
   POST /api/bodega
========================================================= */

async function crearBodega(req, res) {

  try {

    const empresaId = obtenerEmpresaId(req);


    if (!empresaId) {

      return res.status(403).json({
        message: 'Usuario sin empresa asignada'
      });

    }


    const {
      nombre_producto,
      unidad,
      cantidad,
      costo_total
    } = req.body;


    if (
      !nombre_producto ||
      !unidad
    ) {

      return res.status(400).json({
        message:
          'Nombre y unidad son obligatorios'
      });

    }


    const cantidadNumero =
      convertirNumero(cantidad ?? 0);

    const costoNumero =
      convertirNumero(costo_total ?? 0);


    if (
      !Number.isFinite(cantidadNumero) ||
      !Number.isFinite(costoNumero) ||
      cantidadNumero < 0 ||
      costoNumero < 0
    ) {

      return res.status(400).json({
        message:
          'Cantidad y costo deben ser números válidos'
      });

    }


    const result = await pool.query(
      `
      INSERT INTO public.materias_primas
      (
        nombre,
        unidad,
        cantidad_total,
        costo_total,
        empresa_id
      )

      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5
      )

      RETURNING

        id,

        nombre
          AS nombre_producto,

        unidad,

        cantidad_total
          AS cantidad,

        costo_total,

        creado_en,

        empresa_id
      `,
      [
        nombre_producto.trim(),
        unidad.trim(),
        cantidadNumero,
        costoNumero,
        empresaId
      ]
    );


    return res
      .status(201)
      .json(result.rows[0]);


  } catch (error) {

    console.error(
      'Error crearBodega:',
      error
    );


    return res.status(500).json({
      message:
        'Error al crear producto de bodega',

      detalle:
        error.message
    });

  }

}



/* =========================================================
   ACTUALIZAR BODEGA
   PUT /api/bodega/:id
========================================================= */

async function actualizarBodega(req, res) {

  try {

    const empresaId = obtenerEmpresaId(req);

    const id =
      Number(req.params.id);


    const {
      nombre_producto,
      unidad,
      cantidad,
      costo_total
    } = req.body;


    if (!empresaId) {

      return res.status(403).json({
        message: 'Usuario sin empresa asignada'
      });

    }


    if (
      !nombre_producto ||
      !unidad
    ) {

      return res.status(400).json({
        message:
          'Nombre y unidad son obligatorios'
      });

    }


    const cantidadNumero =
      convertirNumero(cantidad ?? 0);

    const costoNumero =
      convertirNumero(costo_total ?? 0);


    if (
      !Number.isFinite(cantidadNumero) ||
      !Number.isFinite(costoNumero) ||
      cantidadNumero < 0 ||
      costoNumero < 0
    ) {

      return res.status(400).json({
        message:
          'Cantidad y costo deben ser números válidos'
      });

    }


    const result = await pool.query(
      `
      UPDATE public.materias_primas

      SET
        nombre = $1,
        unidad = $2,
        cantidad_total = $3,
        costo_total = $4

      WHERE id = $5
        AND empresa_id = $6

      RETURNING

        id,

        nombre
          AS nombre_producto,

        unidad,

        cantidad_total
          AS cantidad,

        costo_total,

        creado_en,

        empresa_id
      `,
      [
        nombre_producto.trim(),
        unidad.trim(),
        cantidadNumero,
        costoNumero,
        id,
        empresaId
      ]
    );


    if (result.rows.length === 0) {

      return res.status(404).json({
        message:
          'Producto de bodega no encontrado'
      });

    }


    return res.json(
      result.rows[0]
    );


  } catch (error) {

    console.error(
      'Error actualizarBodega:',
      error
    );


    return res.status(500).json({
      message:
        'Error al actualizar bodega',

      detalle:
        error.message
    });

  }

}



/* =========================================================
   ELIMINAR BODEGA
   DELETE /api/bodega/:id
========================================================= */

async function eliminarBodega(req, res) {

  try {

    const empresaId =
      obtenerEmpresaId(req);

    const id =
      Number(req.params.id);


    if (!empresaId) {

      return res.status(403).json({
        message: 'Usuario sin empresa asignada'
      });

    }


    const result = await pool.query(
      `
      DELETE FROM public.materias_primas

      WHERE id = $1
        AND empresa_id = $2

      RETURNING

        id,

        nombre
          AS nombre_producto,

        unidad,

        cantidad_total
          AS cantidad,

        costo_total
      `,
      [
        id,
        empresaId
      ]
    );


    if (result.rows.length === 0) {

      return res.status(404).json({
        message:
          'Producto de bodega no encontrado'
      });

    }


    return res.json({

      message:
        'Producto eliminado',

      producto:
        result.rows[0]

    });


  } catch (error) {

    /*
       23503 =
       FOREIGN KEY VIOLATION

       Significa que esa materia prima está
       siendo utilizada por otra tabla.
    */

    if (error.code === '23503') {

      return res.status(409).json({
        message:
          'No se puede eliminar porque esta materia prima está siendo utilizada.'
      });

    }


    console.error(
      'Error eliminarBodega:',
      error
    );


    return res.status(500).json({
      message:
        'Error al eliminar bodega',

      detalle:
        error.message
    });

  }

}



/* =========================================================
   COCINA

   MODELO MAESTRO:

   tipo_porcion
        ↓
   define la porción

   porciones
        ↓
   mantiene el stock disponible
========================================================= */


/* =========================================================
   LISTAR COCINA
   GET /api/cocina
========================================================= */

async function listarCocina(req, res) {

  try {

    const empresaId =
      obtenerEmpresaId(req);


    if (!empresaId) {

      return res.status(403).json({
        message:
          'Usuario sin empresa asignada'
      });

    }


    /*
       IMPORTANTE:

       El ID que devolvemos es:

       tipo_porcion.id

       Esto será importante después para Recetas,
       porque receta_detalle utiliza tipo_porcion_id.
    */

    const result = await pool.query(
      `
      SELECT

        tp.id,

        tp.id_materia_prima,

        mp.nombre
          AS nombre_producto,

        mp.unidad
          AS unidad_bodega,

        tp.gramos,

        COALESCE(
          p.unidades_disponibles,
          0
        ) AS cantidad,

        COALESCE(
          p.costo_unidad,
          tp.costo_unitario,
          0
        ) AS costo_unitario,

        ROUND(
          COALESCE(
            p.unidades_disponibles,
            0
          )
          *
          COALESCE(
            p.costo_unidad,
            tp.costo_unitario,
            0
          ),
          2
        ) AS costo_total,

        COALESCE(
          p.stock_minimo,
          10
        ) AS stock_minimo

      FROM public.tipo_porcion tp

      INNER JOIN public.materias_primas mp

        ON mp.id =
           tp.id_materia_prima

      LEFT JOIN LATERAL
      (
        SELECT
          p2.*

        FROM public.porciones p2

        WHERE p2.empresa_id = $1

          AND LOWER(
                TRIM(p2.proteina)
              )
              =
              LOWER(
                TRIM(mp.nombre)
              )

          AND p2.gramos =
              tp.gramos

        ORDER BY p2.id

        LIMIT 1

      ) p ON TRUE


      WHERE mp.empresa_id = $1

        AND
        (
          tp.empresa_id = $1
          OR tp.empresa_id IS NULL
        )

      ORDER BY tp.id DESC
      `,
      [empresaId]
    );


    /*
       Adaptamos el resultado al formato
       que el frontend ya conoce:

       nombre_producto
       unidad
       cantidad
       costo_unitario
       costo_total
    */

    const datos = result.rows.map(
      item => ({

        id:
          Number(item.id),

        id_materia_prima:
          Number(item.id_materia_prima),

        nombre_producto:
          item.nombre_producto,

        unidad:
          formatearUnidadCocina(
            Number(item.gramos),
            item.unidad_bodega
          ),

        cantidad:
          Number(item.cantidad || 0),

        costo_unitario:
          Number(item.costo_unitario || 0),

        costo_total:
          Number(item.costo_total || 0),

        stock_minimo:
          Number(item.stock_minimo || 0)

      })
    );


    return res.json(datos);


  } catch (error) {

    console.error(
      'Error listarCocina:',
      error
    );


    return res.status(500).json({

      message:
        'Error al listar cocina',

      detalle:
        error.message

    });

  }

}



/* =========================================================
   CREAR COCINA
   POST /api/cocina

   Esta ruta se conserva por compatibilidad.

   El flujo normal de CCC-Básico utiliza /traspasar.
========================================================= */

async function crearCocina(req, res) {

  const client =
    await pool.connect();


  try {

    const empresaId =
      obtenerEmpresaId(req);


    const {
      nombre_producto,
      unidad,
      cantidad,
      costo_total,
      costo_unitario,
      stock_minimo
    } = req.body;


    if (!empresaId) {

      return res.status(403).json({
        message:
          'Usuario sin empresa asignada'
      });

    }


    const gramos =
      Math.round(
        extraerGramos(unidad)
      );


    const cantidadNumero =
      convertirNumero(cantidad ?? 0);

    const costoTotalNumero =
      convertirNumero(costo_total ?? 0);


    if (
      !nombre_producto ||
      gramos <= 0
    ) {

      return res.status(400).json({
        message:
          'Producto y medida son obligatorios'
      });

    }


    if (
      !Number.isFinite(cantidadNumero) ||
      cantidadNumero < 0 ||
      !Number.isFinite(costoTotalNumero) ||
      costoTotalNumero < 0
    ) {

      return res.status(400).json({
        message:
          'Cantidad o costo inválido'
      });

    }


    await client.query('BEGIN');


    /*
       Cocina debe provenir de una materia prima
       existente de Bodega.
    */

    const materiaResult =
      await client.query(
        `
        SELECT *

        FROM public.materias_primas

        WHERE empresa_id = $1

          AND LOWER(TRIM(nombre))
              =
              LOWER(TRIM($2))

        LIMIT 1
        `,
        [
          empresaId,
          nombre_producto.trim()
        ]
      );


    if (
      materiaResult.rows.length === 0
    ) {

      await client.query('ROLLBACK');


      return res.status(400).json({
        message:
          'El producto debe existir primero en Bodega'
      });

    }


    const materia =
      materiaResult.rows[0];


    const unidadCocina =
      formatearUnidadCocina(
        gramos,
        materia.unidad
      );


    const costoUnitarioNumero =
      costo_unitario !== undefined
        ? Number(costo_unitario || 0)
        : cantidadNumero > 0
          ? costoTotalNumero /
            cantidadNumero
          : 0;


    /*
       Buscamos si ya existe esa porción.
    */

    let tipoResult =
      await client.query(
        `
        SELECT *

        FROM public.tipo_porcion

        WHERE id_materia_prima = $1

          AND gramos = $2

          AND
          (
            empresa_id = $3
            OR empresa_id IS NULL
          )

        ORDER BY id

        LIMIT 1
        `,
        [
          materia.id,
          gramos,
          empresaId
        ]
      );


    let tipoPorcion;


    if (
      tipoResult.rows.length === 0
    ) {

      tipoResult =
        await client.query(
          `
          INSERT INTO public.tipo_porcion
          (
            id_materia_prima,
            nombre,
            gramos,
            costo_unitario,
            empresa_id
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5
          )

          RETURNING *
          `,
          [
            materia.id,
            unidadCocina,
            gramos,
            costoUnitarioNumero,
            empresaId
          ]
        );


      tipoPorcion =
        tipoResult.rows[0];

    } else {

      tipoPorcion =
        tipoResult.rows[0];


      await client.query(
        `
        UPDATE public.tipo_porcion

        SET
          costo_unitario = $1,
          empresa_id = $2

        WHERE id = $3
        `,
        [
          costoUnitarioNumero,
          empresaId,
          tipoPorcion.id
        ]
      );

    }


    /*
       Buscamos stock físico de esa porción.
    */

    const stockResult =
      await client.query(
        `
        SELECT *

        FROM public.porciones

        WHERE empresa_id = $1

          AND LOWER(TRIM(proteina))
              =
              LOWER(TRIM($2))

          AND gramos = $3

        ORDER BY id

        LIMIT 1
        `,
        [
          empresaId,
          materia.nombre,
          gramos
        ]
      );


    if (
      stockResult.rows.length === 0
    ) {

      await client.query(
        `
        INSERT INTO public.porciones
        (
          nombre,
          proteina,
          gramos,
          costo_unidad,
          empresa_id,
          unidades_disponibles,
          stock_minimo
        )

        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
        `,
        [
          `${materia.nombre} ${unidadCocina}`,
          materia.nombre,
          gramos,
          costoUnitarioNumero,
          empresaId,
          Math.floor(cantidadNumero),
          Number(stock_minimo || 10)
        ]
      );

    } else {

      await client.query(
        `
        UPDATE public.porciones

        SET
          costo_unidad = $1,
          unidades_disponibles = $2,
          stock_minimo = $3

        WHERE id = $4
        `,
        [
          costoUnitarioNumero,
          Math.floor(cantidadNumero),
          Number(stock_minimo || 10),
          stockResult.rows[0].id
        ]
      );

    }


    await client.query('COMMIT');


    return res.status(201).json({

      id:
        Number(tipoPorcion.id),

      nombre_producto:
        materia.nombre,

      unidad:
        unidadCocina,

      cantidad:
        Math.floor(cantidadNumero),

      costo_unitario:
        costoUnitarioNumero,

      costo_total:
        costoUnitarioNumero *
        Math.floor(cantidadNumero),

      stock_minimo:
        Number(stock_minimo || 10)

    });


  } catch (error) {

    await client.query('ROLLBACK');


    console.error(
      'Error crearCocina:',
      error
    );


    return res.status(500).json({

      message:
        'Error al crear producto de cocina',

      detalle:
        error.message

    });


  } finally {

    client.release();

  }

}



/* =========================================================
   ACTUALIZAR COCINA
   PUT /api/cocina/:id

   id = tipo_porcion.id
========================================================= */

async function actualizarCocina(req, res) {

  const client =
    await pool.connect();


  try {

    const empresaId =
      obtenerEmpresaId(req);

    const id =
      Number(req.params.id);


    const {
      nombre_producto,
      unidad,
      cantidad,
      costo_total,
      stock_minimo
    } = req.body;


    if (!empresaId) {

      return res.status(403).json({
        message:
          'Usuario sin empresa asignada'
      });

    }


    const cantidadNumero =
      convertirNumero(cantidad ?? 0);

    const costoTotalNumero =
      convertirNumero(costo_total ?? 0);


    if (
      !nombre_producto ||
      !unidad
    ) {

      return res.status(400).json({
        message:
          'Nombre y unidad son obligatorios'
      });

    }


    const gramos =
      Math.round(
        extraerGramos(unidad)
      );


    if (gramos <= 0) {

      return res.status(400).json({
        message:
          'La unidad o medida de la porción debe ser válida'
      });

    }


    if (
      !Number.isFinite(cantidadNumero) ||
      cantidadNumero < 0 ||
      !Number.isFinite(costoTotalNumero) ||
      costoTotalNumero < 0
    ) {

      return res.status(400).json({
        message:
          'Cantidad o costo inválido'
      });

    }


    await client.query('BEGIN');


    /*
       Buscamos la porción actual y verificamos
       que pertenezca a esta empresa.
    */

    const actualResult =
      await client.query(
        `
        SELECT

          tp.*,

          mp.nombre
            AS materia_nombre,

          mp.empresa_id

        FROM public.tipo_porcion tp

        INNER JOIN public.materias_primas mp

          ON mp.id =
             tp.id_materia_prima

        WHERE tp.id = $1

          AND mp.empresa_id = $2

        LIMIT 1
        `,
        [
          id,
          empresaId
        ]
      );


    if (
      actualResult.rows.length === 0
    ) {

      await client.query('ROLLBACK');


      return res.status(404).json({
        message:
          'Producto de cocina no encontrado'
      });

    }


    const actual =
      actualResult.rows[0];


    /*
       El nuevo nombre debe existir en Bodega.
    */

    const materiaResult =
      await client.query(
        `
        SELECT *

        FROM public.materias_primas

        WHERE empresa_id = $1

          AND LOWER(TRIM(nombre))
              =
              LOWER(TRIM($2))

        LIMIT 1
        `,
        [
          empresaId,
          nombre_producto.trim()
        ]
      );


    if (
      materiaResult.rows.length === 0
    ) {

      await client.query('ROLLBACK');


      return res.status(400).json({
        message:
          'El producto debe existir en Bodega'
      });

    }


    const materia =
      materiaResult.rows[0];


    const unidadCocina =
      formatearUnidadCocina(
        gramos,
        materia.unidad
      );


    const costoUnitarioNumero =
      cantidadNumero > 0
        ? costoTotalNumero /
          cantidadNumero
        : 0;


    /*
       Actualizamos definición de la porción.
    */

    await client.query(
      `
      UPDATE public.tipo_porcion

      SET
        id_materia_prima = $1,
        nombre = $2,
        gramos = $3,
        costo_unitario = $4,
        empresa_id = $5

      WHERE id = $6
      `,
      [
        materia.id,
        unidadCocina,
        gramos,
        costoUnitarioNumero,
        empresaId,
        id
      ]
    );


    /*
       Buscamos el stock de cocina que correspondía
       a la definición anterior.
    */

    const stockResult =
      await client.query(
        `
        SELECT *

        FROM public.porciones

        WHERE empresa_id = $1

          AND LOWER(TRIM(proteina))
              =
              LOWER(TRIM($2))

          AND gramos = $3

        ORDER BY id

        LIMIT 1
        `,
        [
          empresaId,
          actual.materia_nombre,
          actual.gramos
        ]
      );


    if (
      stockResult.rows.length === 0
    ) {

      await client.query(
        `
        INSERT INTO public.porciones
        (
          nombre,
          proteina,
          gramos,
          costo_unidad,
          empresa_id,
          unidades_disponibles,
          stock_minimo
        )

        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
        `,
        [
          `${materia.nombre} ${unidadCocina}`,
          materia.nombre,
          gramos,
          costoUnitarioNumero,
          empresaId,
          Math.floor(cantidadNumero),
          Number(stock_minimo || 10)
        ]
      );

    } else {

      await client.query(
        `
        UPDATE public.porciones

        SET
          nombre = $1,
          proteina = $2,
          gramos = $3,
          costo_unidad = $4,
          unidades_disponibles = $5,
          stock_minimo = $6

        WHERE id = $7
        `,
        [
          `${materia.nombre} ${unidadCocina}`,
          materia.nombre,
          gramos,
          costoUnitarioNumero,
          Math.floor(cantidadNumero),
          Number(stock_minimo || 10),
          stockResult.rows[0].id
        ]
      );

    }


    await client.query('COMMIT');


    return res.json({

      id,

      nombre_producto:
        materia.nombre,

      unidad:
        unidadCocina,

      cantidad:
        Math.floor(cantidadNumero),

      costo_unitario:
        costoUnitarioNumero,

      costo_total:
        costoTotalNumero,

      stock_minimo:
        Number(stock_minimo || 10)

    });


  } catch (error) {

    await client.query('ROLLBACK');


    console.error(
      'Error actualizarCocina:',
      error
    );


    return res.status(500).json({

      message:
        'Error al actualizar cocina',

      detalle:
        error.message

    });


  } finally {

    client.release();

  }

}



/* =========================================================
   ELIMINAR COCINA
   DELETE /api/cocina/:id
========================================================= */

async function eliminarCocina(req, res) {

  const client =
    await pool.connect();


  try {

    const empresaId =
      obtenerEmpresaId(req);

    const id =
      Number(req.params.id);


    if (!empresaId) {

      return res.status(403).json({
        message:
          'Usuario sin empresa asignada'
      });

    }


    await client.query('BEGIN');


    /*
       Primero identificamos la materia prima
       y los gramos asociados.
    */

    const tipoResult =
      await client.query(
        `
        SELECT

          tp.*,

          mp.nombre
            AS materia_nombre

        FROM public.tipo_porcion tp

        INNER JOIN public.materias_primas mp

          ON mp.id =
             tp.id_materia_prima

        WHERE tp.id = $1

          AND mp.empresa_id = $2

        LIMIT 1
        `,
        [
          id,
          empresaId
        ]
      );


    if (
      tipoResult.rows.length === 0
    ) {

      await client.query('ROLLBACK');


      return res.status(404).json({
        message:
          'Producto de cocina no encontrado'
      });

    }


    const tipo =
      tipoResult.rows[0];


    /*
       Quitamos el stock físico.
    */

    await client.query(
      `
      DELETE FROM public.porciones

      WHERE empresa_id = $1

        AND LOWER(TRIM(proteina))
            =
            LOWER(TRIM($2))

        AND gramos = $3
      `,
      [
        empresaId,
        tipo.materia_nombre,
        tipo.gramos
      ]
    );


    /*
       Después eliminamos tipo_porcion.

       Si está siendo usada en receta_detalle,
       PostgreSQL impedirá eliminarla.
    */

    await client.query(
      `
      DELETE FROM public.tipo_porcion

      WHERE id = $1
      `,
      [id]
    );


    await client.query('COMMIT');


    return res.json({
      message:
        'Producto eliminado'
    });


  } catch (error) {

    await client.query('ROLLBACK');


    /*
       Está siendo utilizado por una receta.
    */

    if (error.code === '23503') {

      return res.status(409).json({
        message:
          'No se puede eliminar. Esta porción está siendo utilizada en una receta.'
      });

    }


    console.error(
      'Error eliminarCocina:',
      error
    );


    return res.status(500).json({

      message:
        'Error al eliminar cocina',

      detalle:
        error.message

    });


  } finally {

    client.release();

  }

}



/* =========================================================
   TRASPASO BODEGA → COCINA

   POST /api/traspasar

   FLUJO:

   materias_primas
          ↓
   tipo_porcion
          ↓
   porciones
========================================================= */

async function traspasarBodegaACocina(req, res) {

  const client =
    await pool.connect();


  try {

    const empresaId =
      obtenerEmpresaId(req);


    const {
      bodega_id,
      cocina_id,
      nombre_cocina,
      unidad_cocina,
      cantidad_bodega,
      cantidad_cocina
    } = req.body;


    const bodegaId =
      Number(bodega_id);


    const cocinaId =
      cocina_id
        ? Number(cocina_id)
        : null;


    const cantidadBodegaNumero =
      convertirNumero(
        cantidad_bodega
      );


    const cantidadCocinaNumero =
      convertirNumero(
        cantidad_cocina
      );


    const gramos =
      Math.round(
        extraerGramos(
          unidad_cocina
        )
      );


    if (!empresaId) {

      return res.status(403).json({
        message:
          'Usuario sin empresa asignada'
      });

    }


    if (
      !bodegaId ||
      !Number.isFinite(
        cantidadBodegaNumero
      ) ||
      cantidadBodegaNumero <= 0 ||
      !Number.isFinite(
        cantidadCocinaNumero
      ) ||
      cantidadCocinaNumero <= 0 ||
      gramos <= 0
    ) {

      return res.status(400).json({
        message:
          'Faltan datos para el traspaso'
      });

    }


    await client.query('BEGIN');


    /* =====================================================
       1. BLOQUEAR MATERIA PRIMA
    ===================================================== */

    const bodegaResult =
      await client.query(
        `
        SELECT *

        FROM public.materias_primas

        WHERE id = $1
          AND empresa_id = $2

        FOR UPDATE
        `,
        [
          bodegaId,
          empresaId
        ]
      );


    if (
      bodegaResult.rows.length === 0
    ) {

      await client.query('ROLLBACK');


      return res.status(404).json({
        message:
          'Producto de bodega no encontrado'
      });

    }


    const bodega =
      bodegaResult.rows[0];


    const unidadCocina =
      formatearUnidadCocina(
        gramos,
        bodega.unidad
      );


    const stockBodega =
      Number(
        bodega.cantidad_total
      );


    const costoBodega =
      Number(
        bodega.costo_total
      );


    if (
      stockBodega <
      cantidadBodegaNumero
    ) {

      await client.query('ROLLBACK');


      return res.status(400).json({
        message:
          'Stock insuficiente en bodega'
      });

    }


    /* =====================================================
       2. CALCULAR COSTO TRASPASADO
    ===================================================== */

    const porcentajeUsado =
      stockBodega > 0
        ? cantidadBodegaNumero /
          stockBodega
        : 0;


    const costoTraspasado =
      Number(
        (
          costoBodega *
          porcentajeUsado
        ).toFixed(2)
      );


    const costoNuevaPorcion =
      cantidadCocinaNumero > 0
        ? costoTraspasado /
          cantidadCocinaNumero
        : 0;


    /* =====================================================
       3. DESCONTAR BODEGA
    ===================================================== */

    await client.query(
      `
      UPDATE public.materias_primas

      SET

        cantidad_total =
          GREATEST(
            cantidad_total - $1,
            0
          ),

        costo_total =
          GREATEST(
            costo_total - $2,
            0
          )

      WHERE id = $3
        AND empresa_id = $4
      `,
      [
        cantidadBodegaNumero,
        costoTraspasado,
        bodegaId,
        empresaId
      ]
    );


    /* =====================================================
       4. BUSCAR TIPO DE PORCIÓN
    ===================================================== */

    let tipoPorcion = null;


    /*
       Si el frontend encontró una porción existente,
       cocina_id corresponde a tipo_porcion.id.
    */

    if (cocinaId) {

      const tipoExistente =
        await client.query(
          `
          SELECT tp.*

          FROM public.tipo_porcion tp

          INNER JOIN public.materias_primas mp

            ON mp.id =
               tp.id_materia_prima

          WHERE tp.id = $1

            AND tp.id_materia_prima = $2

            AND mp.empresa_id = $3

          LIMIT 1
          `,
          [
            cocinaId,
            bodegaId,
            empresaId
          ]
        );


      if (
        tipoExistente.rows.length > 0
      ) {

        tipoPorcion =
          tipoExistente.rows[0];

      }

    }


    /*
       Si no vino cocina_id o no se encontró,
       buscamos por materia prima + gramos.
    */

    if (!tipoPorcion) {

      const tipoExistente =
        await client.query(
          `
          SELECT *

          FROM public.tipo_porcion

          WHERE id_materia_prima = $1

            AND gramos = $2

            AND
            (
              empresa_id = $3
              OR empresa_id IS NULL
            )

          ORDER BY id

          LIMIT 1
          `,
          [
            bodegaId,
            gramos,
            empresaId
          ]
        );


      if (
        tipoExistente.rows.length > 0
      ) {

        tipoPorcion =
          tipoExistente.rows[0];

      }

    }


    /* =====================================================
       5. BUSCAR STOCK ACTUAL DE COCINA
    ===================================================== */

    const stockResult =
      await client.query(
        `
        SELECT *

        FROM public.porciones

        WHERE empresa_id = $1

          AND LOWER(TRIM(proteina))
              =
              LOWER(TRIM($2))

          AND gramos = $3

        ORDER BY id

        LIMIT 1

        FOR UPDATE
        `,
        [
          empresaId,
          bodega.nombre,
          gramos
        ]
      );


    const stockAnterior =
      stockResult.rows.length > 0
        ? Number(
            stockResult.rows[0]
              .unidades_disponibles || 0
          )
        : 0;


    const costoAnterior =
      stockResult.rows.length > 0
        ? Number(
            stockResult.rows[0]
              .costo_unidad || 0
          )
        : 0;


    const nuevasUnidades =
      Math.floor(
        cantidadCocinaNumero
      );


    const unidadesTotales =
      stockAnterior +
      nuevasUnidades;


    /*
       Costo promedio ponderado.

       Ejemplo:

       había:
       10 porciones a $1.000

       llegan:
       5 porciones a $1.200

       se calcula el nuevo costo promedio.
    */

    const nuevoCostoUnitario =
      unidadesTotales > 0

        ? (
            (
              stockAnterior *
              costoAnterior
            )
            +
            costoTraspasado
          )
          /
          unidadesTotales

        : costoNuevaPorcion;


    /* =====================================================
       6. CREAR / ACTUALIZAR TIPO_PORCION
    ===================================================== */

    if (!tipoPorcion) {

      const nuevoTipo =
        await client.query(
          `
          INSERT INTO public.tipo_porcion
          (
            id_materia_prima,
            nombre,
            gramos,
            costo_unitario,
            empresa_id
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5
          )

          RETURNING *
          `,
          [
            bodegaId,
            unidadCocina,
            gramos,
            nuevoCostoUnitario,
            empresaId
          ]
        );


      tipoPorcion =
        nuevoTipo.rows[0];

    } else {

      const actualizado =
        await client.query(
          `
          UPDATE public.tipo_porcion

          SET

            nombre = $1,

            gramos = $2,

            costo_unitario = $3,

            empresa_id = $4

          WHERE id = $5

          RETURNING *
          `,
          [
            unidadCocina,
            gramos,
            nuevoCostoUnitario,
            empresaId,
            tipoPorcion.id
          ]
        );


      tipoPorcion =
        actualizado.rows[0];

    }


    /* =====================================================
       7. CREAR / ACTUALIZAR STOCK EN PORCIONES
    ===================================================== */

    let stockMinimo = 10;


    if (
      stockResult.rows.length > 0
    ) {

      stockMinimo =
        Number(
          stockResult.rows[0]
            .stock_minimo || 10
        );


      await client.query(
        `
        UPDATE public.porciones

        SET

          nombre = $1,

          proteina = $2,

          gramos = $3,

          costo_unidad = $4,

          unidades_disponibles = $5

        WHERE id = $6
        `,
        [
          `${bodega.nombre} ${unidadCocina}`,
          bodega.nombre,
          gramos,
          nuevoCostoUnitario,
          unidadesTotales,
          stockResult.rows[0].id
        ]
      );

    } else {

      await client.query(
        `
        INSERT INTO public.porciones
        (
          nombre,
          proteina,
          gramos,
          costo_unidad,
          empresa_id,
          unidades_disponibles,
          stock_minimo
        )

        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
        `,
        [
          `${bodega.nombre} ${unidadCocina}`,
          bodega.nombre,
          gramos,
          nuevoCostoUnitario,
          empresaId,
          nuevasUnidades,
          stockMinimo
        ]
      );

    }


    /* =====================================================
       8. BEBESTIBLE -> PRODUCTO DE VENTA AUTOMÁTICO

       REGLA:

       El nombre en Bodega debe comenzar con la palabra:

       bebestible

       Ejemplos:

       bebestible Fanta
       bebestible Coca Cola
       bebestible jugo de naranja
       bebestible agua sin gas

       Si cumple esa regla, al pasar el producto a Cocina
       también se registra automáticamente en public.menu.

       De esta forma aparece inmediatamente en:

       Productos / Recetas -> Seleccionar producto

       IMPORTANTE:

       - NO usamos "unidad" para decidir si es bebestible.
       - Pan de completo puede ser unidad y sigue siendo receta.
       - Vienesa puede ser unidad y sigue siendo receta.
       - NO se crean productos duplicados.
       - NO se agrega ninguna columna nueva a la base de datos.
    ===================================================== */

    if (
      esBebestible(
        bodega.nombre
      )
    ) {

      const productoExistente =
        await client.query(
          `
          SELECT
            id

          FROM public.menu

          WHERE empresa_id = $1

            AND LOWER(
                  TRIM(nombre)
                )
                =
                LOWER(
                  TRIM($2)
                )

          LIMIT 1
          `,
          [
            empresaId,
            bodega.nombre
          ]
        );


      if (
        productoExistente.rows.length === 0
      ) {

        await client.query(
          `
          INSERT INTO public.menu
          (
            nombre,
            precio,
            tipo,
            cantidad,
            activo,
            empresa_id
          )

          VALUES
          (
            $1,
            0,
            'bebestible',
            1,
            TRUE,
            $2
          )
          `,
          [
            bodega.nombre,
            empresaId
          ]
        );

      }

    }


    /* =====================================================
       9. CONFIRMAR TRANSACCIÓN
    ===================================================== */

    await client.query('COMMIT');


    /*
       Respondemos usando exactamente la forma
       que CCC-Básico espera.
    */

    return res.json({

      message:
        'Traspaso realizado correctamente',

      cocina: {

        id:
          Number(tipoPorcion.id),

        nombre_producto:
          nombre_cocina ||
          bodega.nombre,

        unidad:
          unidadCocina,

        cantidad:
          unidadesTotales,

        costo_unitario:
          nuevoCostoUnitario,

        costo_total:
          nuevoCostoUnitario *
          unidadesTotales,

        stock_minimo:
          stockMinimo

      }

    });


  } catch (error) {

    await client.query('ROLLBACK');


    console.error(
      'Error traspasarBodegaACocina:',
      error
    );


    return res.status(500).json({

      message:
        'Error al traspasar de bodega a cocina',

      detalle:
        error.message

    });


  } finally {

    client.release();

  }

}



/* =========================================================
   EXPORTAR CONTROLADORES
========================================================= */

module.exports = {

  listarBodega,
  crearBodega,
  actualizarBodega,
  eliminarBodega,

  listarCocina,
  crearCocina,
  actualizarCocina,
  eliminarCocina,

  traspasarBodegaACocina

};