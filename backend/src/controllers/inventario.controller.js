const pool = require('../config/db');

/* =====================================================
   BODEGA
===================================================== */

async function listarBodega(req, res) {
  try {
    const result = await pool.query(
      `SELECT *
       FROM inventario_bodega
       ORDER BY id DESC`
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('Error listarBodega:', error);

    return res.status(500).json({
      message: 'Error al listar bodega'
    });
  }
}

async function crearBodega(req, res) {
  try {
    const {
      nombre_producto,
      unidad,
      cantidad,
      costo_total
    } = req.body;

    if (!nombre_producto || !unidad) {
      return res.status(400).json({
        message: 'Nombre y unidad son obligatorios'
      });
    }

    const cantidadNumero = Number(cantidad || 0);
    const costoNumero = Number(costo_total || 0);

    if (cantidadNumero < 0 || costoNumero < 0) {
      return res.status(400).json({
        message: 'Cantidad y costo no pueden ser negativos'
      });
    }

    const result = await pool.query(
      `INSERT INTO inventario_bodega
       (
         nombre_producto,
         unidad,
         cantidad,
         costo_total
       )
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        nombre_producto.trim(),
        unidad.trim(),
        cantidadNumero,
        costoNumero
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error crearBodega:', error);

    return res.status(500).json({
      message: 'Error al crear producto de bodega'
    });
  }
}

async function actualizarBodega(req, res) {
  try {
    const { id } = req.params;

    const {
      nombre_producto,
      unidad,
      cantidad,
      costo_total
    } = req.body;

    if (!nombre_producto || !unidad) {
      return res.status(400).json({
        message: 'Nombre y unidad son obligatorios'
      });
    }

    const cantidadNumero = Number(cantidad || 0);
    const costoNumero = Number(costo_total || 0);

    if (cantidadNumero < 0 || costoNumero < 0) {
      return res.status(400).json({
        message: 'Cantidad y costo no pueden ser negativos'
      });
    }

    const result = await pool.query(
      `UPDATE inventario_bodega
       SET
         nombre_producto = $1,
         unidad = $2,
         cantidad = $3,
         costo_total = $4
       WHERE id = $5
       RETURNING *`,
      [
        nombre_producto.trim(),
        unidad.trim(),
        cantidadNumero,
        costoNumero,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Producto de bodega no encontrado'
      });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizarBodega:', error);

    return res.status(500).json({
      message: 'Error al actualizar bodega'
    });
  }
}

async function eliminarBodega(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM inventario_bodega
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Producto de bodega no encontrado'
      });
    }

    return res.json({
      message: 'Producto eliminado',
      producto: result.rows[0]
    });
  } catch (error) {
    console.error('Error eliminarBodega:', error);

    return res.status(500).json({
      message: 'Error al eliminar bodega'
    });
  }
}

/* =====================================================
   COCINA
===================================================== */

async function listarCocina(req, res) {
  try {
    const result = await pool.query(
      `SELECT *
       FROM inventario_cocina
       ORDER BY id DESC`
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('Error listarCocina:', error);

    return res.status(500).json({
      message: 'Error al listar cocina'
    });
  }
}

async function crearCocina(req, res) {
  try {
    const {
      nombre_producto,
      unidad,
      cantidad,
      costo_total,
      costo_unitario,
      stock_minimo
    } = req.body;

    if (!nombre_producto || !unidad) {
      return res.status(400).json({
        message: 'Nombre y unidad son obligatorios'
      });
    }

    const cantidadNumero = Number(cantidad || 0);
    const costoTotalNumero = Number(costo_total || 0);

    const costoUnitarioNumero =
      costo_unitario !== undefined
        ? Number(costo_unitario || 0)
        : cantidadNumero > 0
          ? costoTotalNumero / cantidadNumero
          : 0;

    const result = await pool.query(
      `INSERT INTO inventario_cocina
       (
         nombre_producto,
         unidad,
         cantidad,
         costo_unitario,
         costo_total,
         stock_minimo
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        nombre_producto.trim(),
        unidad.trim(),
        cantidadNumero,
        costoUnitarioNumero,
        costoTotalNumero,
        Number(stock_minimo || 0)
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error crearCocina:', error);

    return res.status(500).json({
      message: 'Error al crear producto de cocina'
    });
  }
}

async function actualizarCocina(req, res) {
  try {
    const { id } = req.params;

    const {
      nombre_producto,
      unidad,
      cantidad,
      costo_total,
      stock_minimo
    } = req.body;

    if (!nombre_producto || !unidad) {
      return res.status(400).json({
        message: 'Nombre y unidad son obligatorios'
      });
    }

    const cantidadNumero = Number(cantidad || 0);
    const costoTotalNumero = Number(costo_total || 0);

    const costoUnitarioNumero =
      cantidadNumero > 0
        ? costoTotalNumero / cantidadNumero
        : 0;

    const result = await pool.query(
      `UPDATE inventario_cocina
       SET
         nombre_producto = $1,
         unidad = $2,
         cantidad = $3,
         costo_unitario = $4,
         costo_total = $5,
         stock_minimo = $6
       WHERE id = $7
       RETURNING *`,
      [
        nombre_producto.trim(),
        unidad.trim(),
        cantidadNumero,
        costoUnitarioNumero,
        costoTotalNumero,
        Number(stock_minimo || 0),
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Producto de cocina no encontrado'
      });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizarCocina:', error);

    return res.status(500).json({
      message: 'Error al actualizar cocina'
    });
  }
}

async function eliminarCocina(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM inventario_cocina
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Producto de cocina no encontrado'
      });
    }

    return res.json({
      message: 'Producto eliminado',
      producto: result.rows[0]
    });
  } catch (error) {
    console.error('Error eliminarCocina:', error);

    return res.status(500).json({
      message:
        'No se puede eliminar. Puede estar usado en una receta.'
    });
  }
}

/* =====================================================
   TRASPASO BODEGA A COCINA
===================================================== */

async function traspasarBodegaACocina(req, res) {
  const client = await pool.connect();

  try {
    const {
      bodega_id,
      cocina_id,
      nombre_cocina,
      unidad_cocina,
      cantidad_bodega,
      cantidad_cocina
    } = req.body;

    const cantidadBodegaNumero = Number(cantidad_bodega);
    const cantidadCocinaNumero = Number(cantidad_cocina);

    if (
      !bodega_id ||
      cantidadBodegaNumero <= 0 ||
      cantidadCocinaNumero <= 0
    ) {
      return res.status(400).json({
        message: 'Faltan datos para el traspaso'
      });
    }

    await client.query('BEGIN');

    const bodegaResult = await client.query(
      `SELECT *
       FROM inventario_bodega
       WHERE id = $1
       FOR UPDATE`,
      [bodega_id]
    );

    if (bodegaResult.rows.length === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        message: 'Producto de bodega no encontrado'
      });
    }

    const bodega = bodegaResult.rows[0];

    const stockBodega = Number(bodega.cantidad);
    const costoBodega = Number(bodega.costo_total);

    if (stockBodega < cantidadBodegaNumero) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        message: 'Stock insuficiente en bodega'
      });
    }

    /*
      Calcula el costo proporcional de la cantidad
      enviada desde bodega.
    */
    const porcentajeUsado =
      stockBodega > 0
        ? cantidadBodegaNumero / stockBodega
        : 0;

    const costoTraspasado = Math.round(
      costoBodega * porcentajeUsado
    );

    await client.query(
      `UPDATE inventario_bodega
       SET
         cantidad = GREATEST(cantidad - $1, 0),
         costo_total = GREATEST(costo_total - $2, 0)
       WHERE id = $3`,
      [
        cantidadBodegaNumero,
        costoTraspasado,
        bodega_id
      ]
    );

    let cocinaActualizada;

    if (cocina_id) {
      const updateCocina = await client.query(
        `UPDATE inventario_cocina
         SET
           cantidad = cantidad + $1,
           costo_total = costo_total + $2,
           costo_unitario =
             CASE
               WHEN cantidad + $1 > 0
               THEN (costo_total + $2) / (cantidad + $1)
               ELSE 0
             END
         WHERE id = $3
         RETURNING *`,
        [
          cantidadCocinaNumero,
          costoTraspasado,
          cocina_id
        ]
      );

      if (updateCocina.rows.length === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          message: 'Producto de cocina no encontrado'
        });
      }

      cocinaActualizada = updateCocina.rows[0];
    } else {
      const costoUnitario =
        cantidadCocinaNumero > 0
          ? costoTraspasado / cantidadCocinaNumero
          : 0;

      const insertCocina = await client.query(
        `INSERT INTO inventario_cocina
         (
           nombre_producto,
           unidad,
           cantidad,
           costo_unitario,
           costo_total,
           stock_minimo
         )
         VALUES ($1, $2, $3, $4, $5, 0)
         RETURNING *`,
        [
          nombre_cocina || bodega.nombre_producto,
          unidad_cocina || bodega.unidad,
          cantidadCocinaNumero,
          costoUnitario,
          costoTraspasado
        ]
      );

      cocinaActualizada = insertCocina.rows[0];
    }

    await client.query('COMMIT');

    return res.json({
      message: 'Traspaso realizado correctamente',
      cocina: cocinaActualizada
    });
  } catch (error) {
    await client.query('ROLLBACK');

    console.error(
      'Error traspasarBodegaACocina:',
      error
    );

    return res.status(500).json({
      message: 'Error al traspasar de bodega a cocina'
    });
  } finally {
    client.release();
  }
}

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