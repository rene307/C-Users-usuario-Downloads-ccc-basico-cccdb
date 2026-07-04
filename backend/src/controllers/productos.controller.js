const pool = require('../config/db');

async function listarProductos(req, res) {
  try {
    const result = await pool.query('SELECT * FROM productos_venta ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al listar productos de venta' });
  }
}

async function crearProducto(req, res) {
  try {
    const { nombre, precio, activo = true } = req.body;

    if (!nombre || precio === undefined) {
      return res.status(400).json({ message: 'Nombre y precio son obligatorios' });
    }

    const result = await pool.query(
      `INSERT INTO productos_venta (nombre, precio, activo)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [nombre, Number(precio || 0), Boolean(activo)]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear producto de venta' });
  }
}

async function actualizarProducto(req, res) {
  try {
    const { id } = req.params;
    const { nombre, precio, activo } = req.body;

    const result = await pool.query(
      `UPDATE productos_venta
       SET nombre = $1, precio = $2, activo = $3
       WHERE id = $4
       RETURNING *`,
      [nombre, Number(precio || 0), Boolean(activo), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar producto' });
  }
}

async function eliminarProducto(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM productos_venta WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    res.json({ message: 'Producto eliminado', producto: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se puede eliminar. Puede tener ventas asociadas.' });
  }
}

async function listarRecetas(req, res) {
  try {
    const result = await pool.query(
      `SELECT
        r.id,
        r.producto_venta_id,
        p.nombre AS producto_venta,
        r.inventario_cocina_id,
        c.nombre_producto AS ingrediente,
        c.unidad,
        r.cantidad_necesaria
       FROM recetas r
       JOIN productos_venta p ON p.id = r.producto_venta_id
       JOIN inventario_cocina c ON c.id = r.inventario_cocina_id
       ORDER BY p.nombre ASC, c.nombre_producto ASC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al listar recetas' });
  }
}

async function crearReceta(req, res) {
  try {
    const { producto_venta_id, inventario_cocina_id, cantidad_necesaria } = req.body;

    if (!producto_venta_id || !inventario_cocina_id || !cantidad_necesaria) {
      return res.status(400).json({ message: 'Faltan datos de la receta' });
    }

    const result = await pool.query(
      `INSERT INTO recetas (producto_venta_id, inventario_cocina_id, cantidad_necesaria)
       VALUES ($1, $2, $3)
       ON CONFLICT (producto_venta_id, inventario_cocina_id)
       DO UPDATE SET cantidad_necesaria = EXCLUDED.cantidad_necesaria
       RETURNING *`,
      [producto_venta_id, inventario_cocina_id, Number(cantidad_necesaria)]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al guardar receta' });
  }
}

async function eliminarReceta(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM recetas WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Receta no encontrada' });
    }

    res.json({ message: 'Ingrediente eliminado de la receta', receta: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar receta' });
  }
}

module.exports = {
  listarProductos,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  listarRecetas,
  crearReceta,
  eliminarReceta,
};
