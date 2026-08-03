const pool = require('../config/db');

async function ventasHoy(req, res) {
  try {
    const ventasResult = await pool.query(
      `SELECT
         v.id,
         v.fecha,
         v.total,
         v.medio_pago,
         u.nombre AS usuario
       FROM ventas v
       LEFT JOIN usuarios u
         ON u.id = v.usuario_id
       WHERE v.fecha::date = CURRENT_DATE
       ORDER BY v.fecha DESC`
    );

    const totalResult = await pool.query(
      `SELECT COALESCE(SUM(total), 0) AS total_dia
       FROM ventas
       WHERE fecha::date = CURRENT_DATE`
    );

    const detalleResult = await pool.query(
      `SELECT
         d.id,
         d.venta_id,
         d.producto_venta_id,
         p.nombre AS producto,
         d.cantidad,
         d.precio_unitario,
         d.subtotal
       FROM detalle_ventas d
       JOIN productos_venta p
         ON p.id = d.producto_venta_id
       JOIN ventas v
         ON v.id = d.venta_id
       WHERE v.fecha::date = CURRENT_DATE
       ORDER BY d.id DESC`
    );

    return res.json({
      total_dia: Number(totalResult.rows[0].total_dia),
      ventas: ventasResult.rows,
      detalles: detalleResult.rows
    });
  } catch (error) {
    console.error('Error ventasHoy:', error);

    return res.status(500).json({
      message: 'Error al listar ventas del día'
    });
  }
}

async function crearVenta(req, res) {
  const client = await pool.connect();

  try {
    const {
      items,
      medio_pago = 'efectivo'
    } = req.body;

    const mediosPermitidos = [
      'efectivo',
      'debito',
      'credito',
      'transferencia'
    ];

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message:
          'La venta debe tener al menos un producto'
      });
    }

    if (!mediosPermitidos.includes(medio_pago)) {
      return res.status(400).json({
        message: 'Medio de pago inválido'
      });
    }

    await client.query('BEGIN');

    const detallesVenta = [];
    const ingredientesNecesarios = new Map();

    let totalVenta = 0;

    for (const item of items) {
      const productoId = Number(
        item.producto_venta_id
      );

      const cantidadVendida = Number(
        item.cantidad
      );

      if (
        !productoId ||
        !cantidadVendida ||
        cantidadVendida <= 0
      ) {
        await client.query('ROLLBACK');

        return res.status(400).json({
          message: 'Producto o cantidad inválida'
        });
      }

      const productoResult = await client.query(
        `SELECT *
         FROM productos_venta
         WHERE id = $1
           AND activo = TRUE`,
        [productoId]
      );

      if (productoResult.rows.length === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          message:
            `Producto ${productoId} no existe o está inactivo`
        });
      }

      const producto = productoResult.rows[0];

      const subtotal =
        Number(producto.precio) *
        cantidadVendida;

      totalVenta += subtotal;

      detallesVenta.push({
        producto_venta_id: productoId,
        cantidad: cantidadVendida,
        precio_unitario: Number(producto.precio),
        subtotal
      });

      const recetaResult = await client.query(
        `SELECT
           inventario_cocina_id,
           cantidad_necesaria
         FROM recetas
         WHERE producto_venta_id = $1`,
        [productoId]
      );

      if (recetaResult.rows.length === 0) {
        await client.query('ROLLBACK');

        return res.status(400).json({
          message:
            `El producto ${producto.nombre} no tiene receta creada`
        });
      }

      for (const receta of recetaResult.rows) {
        const inventarioId = Number(
          receta.inventario_cocina_id
        );

        const cantidadNecesaria =
          Number(receta.cantidad_necesaria) *
          cantidadVendida;

        const acumulado =
          ingredientesNecesarios.get(inventarioId) ||
          0;

        ingredientesNecesarios.set(
          inventarioId,
          acumulado + cantidadNecesaria
        );
      }
    }

    for (
      const [
        inventarioId,
        cantidadNecesaria
      ] of ingredientesNecesarios.entries()
    ) {
      const stockResult = await client.query(
        `SELECT *
         FROM inventario_cocina
         WHERE id = $1
         FOR UPDATE`,
        [inventarioId]
      );

      if (stockResult.rows.length === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          message:
            `Ingrediente de cocina ${inventarioId} no encontrado`
        });
      }

      const ingrediente = stockResult.rows[0];

      if (
        Number(ingrediente.cantidad) <
        cantidadNecesaria
      ) {
        await client.query('ROLLBACK');

        return res.status(400).json({
          message:
            `Stock insuficiente: ${ingrediente.nombre_producto}. ` +
            `Disponible: ${ingrediente.cantidad}, ` +
            `necesario: ${cantidadNecesaria}`
        });
      }
    }

    const ventaResult = await client.query(
      `INSERT INTO ventas
       (
         total,
         medio_pago,
         usuario_id
       )
       VALUES ($1, $2, $3)
       RETURNING *`,
      [
        totalVenta,
        medio_pago,
        req.user.id
      ]
    );

    const venta = ventaResult.rows[0];

    for (const detalle of detallesVenta) {
      await client.query(
        `INSERT INTO detalle_ventas
         (
           venta_id,
           producto_venta_id,
           cantidad,
           precio_unitario,
           subtotal
         )
         VALUES ($1, $2, $3, $4, $5)`,
        [
          venta.id,
          detalle.producto_venta_id,
          detalle.cantidad,
          detalle.precio_unitario,
          detalle.subtotal
        ]
      );
    }

    for (
      const [
        inventarioId,
        cantidadNecesaria
      ] of ingredientesNecesarios.entries()
    ) {
      await client.query(
        `UPDATE inventario_cocina
         SET
           costo_total =
             CASE
               WHEN cantidad > 0
               THEN GREATEST(
                 costo_total -
                 ((costo_total / cantidad) * $1),
                 0
               )
               ELSE 0
             END,
           cantidad = cantidad - $1,
           costo_unitario =
             CASE
               WHEN cantidad - $1 > 0
               THEN costo_unitario
               ELSE 0
             END
         WHERE id = $2`,
        [
          cantidadNecesaria,
          inventarioId
        ]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      message:
        'Venta registrada e inventario descontado correctamente',
      venta,
      detalles: detallesVenta
    });
  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Error crearVenta:', error);

    return res.status(500).json({
      message: 'Error al registrar venta'
    });
  } finally {
    client.release();
  }
}

module.exports = {
  ventasHoy,
  crearVenta
};