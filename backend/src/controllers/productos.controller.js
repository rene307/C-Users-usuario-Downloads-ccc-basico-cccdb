const pool = require('../config/db');


/* =========================================================
   FUNCIONES AUXILIARES
========================================================= */


/*
   Obtiene la empresa desde el JWT.

   Cada usuario trabaja únicamente
   con los datos de su empresa.
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
   Convierte valores a boolean correctamente.

   Evita problemas como:

   Boolean("false") === true
*/
function convertirBoolean(valor, defecto = true) {

  if (valor === undefined || valor === null) {
    return defecto;
  }

  if (typeof valor === 'boolean') {
    return valor;
  }

  const texto =
    String(valor)
      .trim()
      .toLowerCase();

  if (
    texto === 'false' ||
    texto === '0' ||
    texto === 'no'
  ) {
    return false;
  }

  return true;
}



/* =========================================================
   PRODUCTOS DE VENTA
   TABLA MAESTRA:
   public.menu
========================================================= */


/* =========================================================
   LISTAR PRODUCTOS
   GET /api/productos
========================================================= */

async function listarProductos(req, res) {

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
       Antes:

       productos_venta

       Ahora:

       public.menu

       El frontend solamente necesita:

       id
       nombre
       precio
       activo
    */

    const result = await pool.query(
      `
      SELECT
        id,
        nombre,
        precio,
        activo

      FROM public.menu

      WHERE empresa_id = $1

      ORDER BY id DESC
      `,
      [empresaId]
    );


    return res.json(
      result.rows
    );


  } catch (error) {

    console.error(
      'Error listarProductos:',
      error
    );


    return res.status(500).json({

      message:
        'Error al listar productos de venta',

      detalle:
        error.message

    });

  }

}



/* =========================================================
   CREAR PRODUCTO
   POST /api/productos
========================================================= */

async function crearProducto(req, res) {

  try {

    const empresaId =
      obtenerEmpresaId(req);


    const {
      nombre,
      precio,
      activo = true
    } = req.body;


    if (!empresaId) {

      return res.status(403).json({
        message:
          'Usuario sin empresa asignada'
      });

    }


    if (
      !nombre ||
      precio === undefined
    ) {

      return res.status(400).json({
        message:
          'Nombre y precio son obligatorios'
      });

    }


    const precioNumero =
      convertirNumero(precio);


    if (
      !Number.isFinite(precioNumero) ||
      precioNumero < 0
    ) {

      return res.status(400).json({
        message:
          'El precio debe ser válido'
      });

    }


    const activoBoolean =
      convertirBoolean(activo);


    /*
       public.menu exige también:

       tipo
       cantidad

       CCC-Básico todavía no pide esos datos
       en su formulario.

       Por eso guardamos:

       tipo = 'producto'
       cantidad = 1

       Más adelante CCC completo podrá utilizar
       estos campos directamente.
    */

    const result = await pool.query(
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
        $2,
        'producto',
        1,
        $3,
        $4
      )

      RETURNING
        id,
        nombre,
        precio,
        activo
      `,
      [
        nombre.trim(),
        precioNumero,
        activoBoolean,
        empresaId
      ]
    );


    return res
      .status(201)
      .json(
        result.rows[0]
      );


  } catch (error) {

    console.error(
      'Error crearProducto:',
      error
    );


    return res.status(500).json({

      message:
        'Error al crear producto de venta',

      detalle:
        error.message

    });

  }

}



/* =========================================================
   ACTUALIZAR PRODUCTO
   PUT /api/productos/:id
========================================================= */

async function actualizarProducto(req, res) {

  try {

    const empresaId =
      obtenerEmpresaId(req);

    const id =
      Number(req.params.id);


    const {
      nombre,
      precio,
      activo
    } = req.body;


    if (!empresaId) {

      return res.status(403).json({
        message:
          'Usuario sin empresa asignada'
      });

    }


    if (
      !nombre ||
      precio === undefined
    ) {

      return res.status(400).json({
        message:
          'Nombre y precio son obligatorios'
      });

    }


    const precioNumero =
      convertirNumero(precio);


    if (
      !Number.isFinite(precioNumero) ||
      precioNumero < 0
    ) {

      return res.status(400).json({
        message:
          'Precio inválido'
      });

    }


    const activoBoolean =
      convertirBoolean(
        activo,
        true
      );


    const result = await pool.query(
      `
      UPDATE public.menu

      SET
        nombre = $1,
        precio = $2,
        activo = $3

      WHERE id = $4
        AND empresa_id = $5

      RETURNING
        id,
        nombre,
        precio,
        activo
      `,
      [
        nombre.trim(),
        precioNumero,
        activoBoolean,
        id,
        empresaId
      ]
    );


    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({
        message:
          'Producto no encontrado'
      });

    }


    return res.json(
      result.rows[0]
    );


  } catch (error) {

    console.error(
      'Error actualizarProducto:',
      error
    );


    return res.status(500).json({

      message:
        'Error al actualizar producto',

      detalle:
        error.message

    });

  }

}



/* =========================================================
   ELIMINAR PRODUCTO
   DELETE /api/productos/:id
========================================================= */

async function eliminarProducto(req, res) {

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


    const result = await pool.query(
      `
      DELETE FROM public.menu

      WHERE id = $1
        AND empresa_id = $2

      RETURNING
        id,
        nombre,
        precio,
        activo
      `,
      [
        id,
        empresaId
      ]
    );


    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({
        message:
          'Producto no encontrado'
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
       Si existe una receta usando este producto,
       PostgreSQL impedirá borrarlo.
    */

    if (error.code === '23503') {

      return res.status(409).json({
        message:
          'No se puede eliminar. El producto tiene una receta asociada.'
      });

    }


    console.error(
      'Error eliminarProducto:',
      error
    );


    return res.status(500).json({

      message:
        'Error al eliminar producto',

      detalle:
        error.message

    });

  }

}



/* =========================================================
   RECETAS

   MODELO MAESTRO:

   menu
      ↓
   recetas
      ↓
   receta_detalle
      ↓
   tipo_porcion
      ↓
   materias_primas
========================================================= */


/* =========================================================
   LISTAR RECETAS
   GET /api/recetas
========================================================= */

async function listarRecetas(req, res) {

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
       El frontend antiguo espera una fila
       por cada ingrediente:

       {
         id,
         producto_venta_id,
         producto_venta,
         inventario_cocina_id,
         ingrediente,
         unidad,
         cantidad_necesaria
       }

       Internamente ahora la estructura real es:

       menu
        ↓
       recetas
        ↓
       receta_detalle
        ↓
       tipo_porcion
    */

    const result = await pool.query(
      `
      SELECT

        rd.id,

        r.menu_id
          AS producto_venta_id,

        m.nombre
          AS producto_venta,

        rd.tipo_porcion_id
          AS inventario_cocina_id,

        mp.nombre
          AS ingrediente,

        CONCAT(
          tp.gramos,
          ' g'
        ) AS unidad,

        rd.cantidad_necesaria,

        rd.costo_unitario,

        rd.subtotal

      FROM public.receta_detalle rd

      INNER JOIN public.recetas r

        ON r.id =
           rd.receta_id

      INNER JOIN public.menu m

        ON m.id =
           r.menu_id

      INNER JOIN public.tipo_porcion tp

        ON tp.id =
           rd.tipo_porcion_id

      INNER JOIN public.materias_primas mp

        ON mp.id =
           tp.id_materia_prima

      WHERE r.empresa_id = $1

        AND m.empresa_id = $1

        AND mp.empresa_id = $1

      ORDER BY
        m.nombre ASC,
        mp.nombre ASC
      `,
      [empresaId]
    );


    return res.json(
      result.rows
    );


  } catch (error) {

    console.error(
      'Error listarRecetas:',
      error
    );


    return res.status(500).json({

      message:
        'Error al listar recetas',

      detalle:
        error.message

    });

  }

}



/* =========================================================
   CREAR / AGREGAR INGREDIENTE
   POST /api/recetas
========================================================= */

async function crearReceta(req, res) {

  const client =
    await pool.connect();


  try {

    const empresaId =
      obtenerEmpresaId(req);


    /*
       Conservamos los nombres antiguos
       porque así los envía actualmente app.js.

       producto_venta_id
          =
       public.menu.id

       inventario_cocina_id
          =
       public.tipo_porcion.id
    */

    const {
      producto_venta_id,
      inventario_cocina_id,
      cantidad_necesaria
    } = req.body;


    const menuId =
      Number(producto_venta_id);

    const tipoPorcionId =
      Number(inventario_cocina_id);

    const cantidadNumero =
      convertirNumero(
        cantidad_necesaria
      );


    if (!empresaId) {

      return res.status(403).json({
        message:
          'Usuario sin empresa asignada'
      });

    }


    if (
      !menuId ||
      !tipoPorcionId ||
      !Number.isFinite(cantidadNumero) ||
      cantidadNumero <= 0
    ) {

      return res.status(400).json({
        message:
          'Faltan datos de la receta'
      });

    }


    await client.query('BEGIN');


    /* =====================================================
       1. VERIFICAR PRODUCTO DEL MENÚ
    ===================================================== */

    const menuResult =
      await client.query(
        `
        SELECT
          id,
          nombre,
          precio

        FROM public.menu

        WHERE id = $1
          AND empresa_id = $2

        LIMIT 1
        `,
        [
          menuId,
          empresaId
        ]
      );


    if (
      menuResult.rows.length === 0
    ) {

      await client.query(
        'ROLLBACK'
      );


      return res.status(404).json({
        message:
          'Producto de venta no encontrado'
      });

    }


    const producto =
      menuResult.rows[0];


    /* =====================================================
       2. VERIFICAR PORCIÓN DE COCINA
    ===================================================== */

    const porcionResult =
      await client.query(
        `
        SELECT

          tp.id,

          tp.id_materia_prima,

          tp.gramos,

          tp.costo_unitario,

          mp.nombre
            AS ingrediente

        FROM public.tipo_porcion tp

        INNER JOIN public.materias_primas mp

          ON mp.id =
             tp.id_materia_prima

        WHERE tp.id = $1

          AND mp.empresa_id = $2

          AND
          (
            tp.empresa_id = $2
            OR tp.empresa_id IS NULL
          )

        LIMIT 1
        `,
        [
          tipoPorcionId,
          empresaId
        ]
      );


    if (
      porcionResult.rows.length === 0
    ) {

      await client.query(
        'ROLLBACK'
      );


      return res.status(404).json({
        message:
          'Ingrediente de cocina no encontrado'
      });

    }


    const porcion =
      porcionResult.rows[0];


    const costoUnitario =
      Number(
        porcion.costo_unitario || 0
      );


    const subtotal =
      Number(
        (
          costoUnitario *
          cantidadNumero
        ).toFixed(2)
      );


    /* =====================================================
       3. BUSCAR RECETA PRINCIPAL
    ===================================================== */

    /*
       Una receta principal corresponde
       a un producto del menú.

       Ejemplo:

       menu:
       Hamburguesa

       recetas:
       Receta Hamburguesa

       receta_detalle:
       pan
       carne
       queso
       tomate
    */

    let recetaResult =
      await client.query(
        `
        SELECT *

        FROM public.recetas

        WHERE empresa_id = $1
          AND menu_id = $2

        ORDER BY id

        LIMIT 1
        `,
        [
          empresaId,
          menuId
        ]
      );


    let receta;


    /* =====================================================
       4. CREAR RECETA SI NO EXISTE
    ===================================================== */

    if (
      recetaResult.rows.length === 0
    ) {

      recetaResult =
        await client.query(
          `
          INSERT INTO public.recetas
          (
            empresa_id,
            menu_id,
            nombre,
            descripcion,
            activo
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            TRUE
          )

          RETURNING *
          `,
          [
            empresaId,
            menuId,
            producto.nombre,
            `Receta de ${producto.nombre}`
          ]
        );


      receta =
        recetaResult.rows[0];

    } else {

      receta =
        recetaResult.rows[0];

    }


    /* =====================================================
       5. REVISAR SI INGREDIENTE YA EXISTE
    ===================================================== */

    const detalleExistente =
      await client.query(
        `
        SELECT id

        FROM public.receta_detalle

        WHERE receta_id = $1
          AND tipo_porcion_id = $2

        LIMIT 1
        `,
        [
          receta.id,
          tipoPorcionId
        ]
      );


    let detalle;


    /* =====================================================
       6A. ACTUALIZAR INGREDIENTE
    ===================================================== */

    if (
      detalleExistente.rows.length > 0
    ) {

      const actualizado =
        await client.query(
          `
          UPDATE public.receta_detalle

          SET
            cantidad_necesaria = $1,
            costo_unitario = $2,
            subtotal = $3

          WHERE id = $4

          RETURNING *
          `,
          [
            cantidadNumero,
            costoUnitario,
            subtotal,
            detalleExistente.rows[0].id
          ]
        );


      detalle =
        actualizado.rows[0];

    }


    /* =====================================================
       6B. INSERTAR INGREDIENTE
    ===================================================== */

    else {

      const insertado =
        await client.query(
          `
          INSERT INTO public.receta_detalle
          (
            receta_id,
            tipo_porcion_id,
            cantidad_necesaria,
            costo_unitario,
            subtotal
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
            receta.id,
            tipoPorcionId,
            cantidadNumero,
            costoUnitario,
            subtotal
          ]
        );


      detalle =
        insertado.rows[0];

    }


    await client.query(
      'COMMIT'
    );


    /* =====================================================
       RESPUESTA COMPATIBLE CON CCC-BÁSICO
    ===================================================== */

    return res
      .status(201)
      .json({

        /*
           IMPORTANTE:

           id corresponde al detalle,
           porque cuando el frontend elimina
           un ingrediente utiliza este id.
        */

        id:
          Number(detalle.id),

        producto_venta_id:
          Number(menuId),

        producto_venta:
          producto.nombre,

        inventario_cocina_id:
          Number(tipoPorcionId),

        ingrediente:
          porcion.ingrediente,

        unidad:
          `${Number(porcion.gramos)} g`,

        cantidad_necesaria:
          Number(cantidadNumero),

        costo_unitario:
          costoUnitario,

        subtotal:
          subtotal

      });


  } catch (error) {

    await client.query(
      'ROLLBACK'
    );


    console.error(
      'Error crearReceta:',
      error
    );


    return res.status(500).json({

      message:
        'Error al guardar receta',

      detalle:
        error.message

    });


  } finally {

    client.release();

  }

}



/* =========================================================
   ELIMINAR INGREDIENTE DE RECETA
   DELETE /api/recetas/:id

   id = receta_detalle.id
========================================================= */

async function eliminarReceta(req, res) {

  const client =
    await pool.connect();


  try {

    const empresaId =
      obtenerEmpresaId(req);

    const detalleId =
      Number(req.params.id);


    if (!empresaId) {

      return res.status(403).json({
        message:
          'Usuario sin empresa asignada'
      });

    }


    await client.query(
      'BEGIN'
    );


    /* =====================================================
       1. IDENTIFICAR DETALLE Y RECETA
    ===================================================== */

    const buscarResult =
      await client.query(
        `
        SELECT

          rd.id,

          rd.receta_id

        FROM public.receta_detalle rd

        INNER JOIN public.recetas r

          ON r.id =
             rd.receta_id

        WHERE rd.id = $1
          AND r.empresa_id = $2

        LIMIT 1
        `,
        [
          detalleId,
          empresaId
        ]
      );


    if (
      buscarResult.rows.length === 0
    ) {

      await client.query(
        'ROLLBACK'
      );


      return res.status(404).json({
        message:
          'Receta no encontrada'
      });

    }


    const recetaId =
      Number(
        buscarResult.rows[0]
          .receta_id
      );


    /* =====================================================
       2. ELIMINAR INGREDIENTE
    ===================================================== */

    const deleteResult =
      await client.query(
        `
        DELETE FROM public.receta_detalle

        WHERE id = $1

        RETURNING *
        `,
        [detalleId]
      );


    /* =====================================================
       3. VER SI QUEDAN INGREDIENTES
    ===================================================== */

    const cantidadResult =
      await client.query(
        `
        SELECT
          COUNT(*)::integer
            AS cantidad

        FROM public.receta_detalle

        WHERE receta_id = $1
        `,
        [recetaId]
      );


    /*
       Si eliminamos el último ingrediente,
       eliminamos también la cabecera vacía
       de la receta.
    */

    if (
      Number(
        cantidadResult.rows[0]
          .cantidad
      ) === 0
    ) {

      await client.query(
        `
        DELETE FROM public.recetas

        WHERE id = $1
          AND empresa_id = $2
        `,
        [
          recetaId,
          empresaId
        ]
      );

    }


    await client.query(
      'COMMIT'
    );


    return res.json({

      message:
        'Ingrediente eliminado de la receta',

      receta:
        deleteResult.rows[0]

    });


  } catch (error) {

    await client.query(
      'ROLLBACK'
    );


    console.error(
      'Error eliminarReceta:',
      error
    );


    return res.status(500).json({

      message:
        'Error al eliminar receta',

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

  listarProductos,
  crearProducto,
  actualizarProducto,
  eliminarProducto,

  listarRecetas,
  crearReceta,
  eliminarReceta

};