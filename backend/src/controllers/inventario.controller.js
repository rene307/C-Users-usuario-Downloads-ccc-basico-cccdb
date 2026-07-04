const pool = require('../config/db');

async function listarBodega(req, res) {
  try {
    const result = await pool.query('SELECT * FROM inventario_bodega ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al listar bodega' });
  }
}

async function crearBodega(req, res) {
  try {
    const { nombre_producto, unidad, cantidad, costo_total } = req.body;

    if (!nombre_producto || !unidad) {
      return res.status(400).json({ message: 'Nombre y unidad son obligatorios' });
    }

    const result = await pool.query(
      `INSERT INTO inventario_bodega (nombre_producto, unidad, cantidad, costo_total)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [nombre_producto, unidad, Number(cantidad || 0), Number(costo_total || 0)]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear producto de bodega' });
  }
}

async function actualizarBodega(req, res) {
  try {
    const { id } = req.params;
    const { nombre_producto, unidad, cantidad, costo_total } = req.body;

    const result = await pool.query(
      `UPDATE inventario_bodega
       SET nombre_producto = $1, unidad = $2, cantidad = $3, costo_total = $4
       WHERE id = $5
       RETURNING *`,
      [nombre_producto, unidad, Number(cantidad || 0), Number(costo_total || 0), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Producto de bodega no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar bodega' });
  }
}

async function eliminarBodega(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM inventario_bodega WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Producto de bodega no encontrado' });
    }

    res.json({ message: 'Producto eliminado', producto: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar bodega' });
  }
}

async function listarCocina(req, res) {
  try {
    const result = await pool.query('SELECT * FROM inventario_cocina ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al listar cocina' });
  }
}

async function crearCocina(req, res) {
  try {
    const { nombre_producto, unidad, cantidad, stock_minimo } = req.body;

    if (!nombre_producto || !unidad) {
      return res.status(400).json({ message: 'Nombre y unidad son obligatorios' });
    }

    const result = await pool.query(
      `INSERT INTO inventario_cocina (nombre_producto, unidad, cantidad, stock_minimo)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [nombre_producto, unidad, Number(cantidad || 0), Number(stock_minimo || 0)]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear producto de cocina' });
  }
}

async function actualizarCocina(req, res) {
  try {
    const { id } = req.params;
    const { nombre_producto, unidad, cantidad, stock_minimo } = req.body;

    const result = await pool.query(
      `UPDATE inventario_cocina
       SET nombre_producto = $1, unidad = $2, cantidad = $3, stock_minimo = $4
       WHERE id = $5
       RETURNING *`,
      [nombre_producto, unidad, Number(cantidad || 0), Number(stock_minimo || 0), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Producto de cocina no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar cocina' });
  }
}

async function eliminarCocina(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM inventario_cocina WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Producto de cocina no encontrado' });
    }

    res.json({ message: 'Producto eliminado', producto: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se puede eliminar. Puede estar usado en una receta.' });
  }
}

async function traspasarBodegaACocina(req, res) {
  const client = await pool.connect();

  try {
    const {
      bodega_id,
      cocina_id,
      nombre_cocina,
      unidad_cocina,
      cantidad_bodega,
      cantidad_cocina,
    } = req.body;

    if (!bodega_id || !cantidad_bodega || !cantidad_cocina) {
      return res.status(400).json({ message: 'Faltan datos para el traspaso' });
    }

    await client.query('BEGIN');

    const bodegaResult = await client.query(
      'SELECT * FROM inventario_bodega WHERE id = $1 FOR UPDATE',
      [bodega_id]
    );

    if (bodegaResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Producto de bodega no encontrado' });
    }

    const bodega = bodegaResult.rows[0];
    const cantBodega = Number(cantidad_bodega);
    const cantCocina = Number(cantidad_cocina);

    if (Number(bodega.cantidad) < cantBodega) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Stock insuficiente en bodega' });
    }

    await client.query(
      'UPDATE inventario_bodega SET cantidad = cantidad - $1 WHERE id = $2',
      [cantBodega, bodega_id]
    );

    let cocinaActualizada;

    if (cocina_id) {
      const updateCocina = await client.query(
        `UPDATE inventario_cocina
         SET cantidad = cantidad + $1
         WHERE id = $2
         RETURNING *`,
        [cantCocina, cocina_id]
      );
      cocinaActualizada = updateCocina.rows[0];
    } else {
      const insertCocina = await client.query(
        `INSERT INTO inventario_cocina (nombre_producto, unidad, cantidad)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [nombre_cocina || bodega.nombre_producto, unidad_cocina || bodega.unidad, cantCocina]
      );
      cocinaActualizada = insertCocina.rows[0];
    }

    await client.query('COMMIT');

    res.json({
      message: 'Traspaso realizado correctamente',
      cocina: cocinaActualizada,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ message: 'Error al traspasar de bodega a cocina' });
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
  traspasarBodegaACocina,
};
