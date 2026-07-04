-- CCC BASICO - MIGRACION SEGURA PARA USAR LA MISMA BASE DE DATOS CCC
-- Este archivo NO borra tablas.
-- Crea las tablas dentro del schema ccc_basico para no chocar con las tablas originales.

CREATE SCHEMA IF NOT EXISTS ccc_basico;
SET search_path TO ccc_basico, public;

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  correo VARCHAR(120) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol VARCHAR(30) NOT NULL DEFAULT 'admin',
  creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventario_bodega (
  id SERIAL PRIMARY KEY,
  nombre_producto VARCHAR(120) NOT NULL,
  unidad VARCHAR(30) NOT NULL,
  cantidad NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  costo_total NUMERIC(12,0) NOT NULL DEFAULT 0 CHECK (costo_total >= 0),
  fecha_registro TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventario_cocina (
  id SERIAL PRIMARY KEY,
  nombre_producto VARCHAR(120) NOT NULL,
  unidad VARCHAR(30) NOT NULL,
  cantidad NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  stock_minimo NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  fecha_registro TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS productos_venta (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  precio NUMERIC(12,0) NOT NULL CHECK (precio >= 0),
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS recetas (
  id SERIAL PRIMARY KEY,
  producto_venta_id INT NOT NULL REFERENCES productos_venta(id) ON DELETE CASCADE,
  inventario_cocina_id INT NOT NULL REFERENCES inventario_cocina(id) ON DELETE RESTRICT,
  cantidad_necesaria NUMERIC(12,3) NOT NULL CHECK (cantidad_necesaria > 0),
  UNIQUE (producto_venta_id, inventario_cocina_id)
);

CREATE TABLE IF NOT EXISTS ventas (
  id SERIAL PRIMARY KEY,
  fecha TIMESTAMP NOT NULL DEFAULT NOW(),
  total NUMERIC(12,0) NOT NULL DEFAULT 0 CHECK (total >= 0),
  usuario_id INT REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS detalle_ventas (
  id SERIAL PRIMARY KEY,
  venta_id INT NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_venta_id INT NOT NULL REFERENCES productos_venta(id),
  cantidad INT NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,0) NOT NULL CHECK (precio_unitario >= 0),
  subtotal NUMERIC(12,0) NOT NULL CHECK (subtotal >= 0)
);

INSERT INTO inventario_bodega (nombre_producto, unidad, cantidad, costo_total)
SELECT 'Carne', 'kg', 10, 60000
WHERE NOT EXISTS (SELECT 1 FROM inventario_bodega WHERE nombre_producto = 'Carne');

INSERT INTO inventario_bodega (nombre_producto, unidad, cantidad, costo_total)
SELECT 'Pan', 'unidad', 40, 12000
WHERE NOT EXISTS (SELECT 1 FROM inventario_bodega WHERE nombre_producto = 'Pan');

INSERT INTO inventario_bodega (nombre_producto, unidad, cantidad, costo_total)
SELECT 'Bebida lata', 'unidad', 24, 18000
WHERE NOT EXISTS (SELECT 1 FROM inventario_bodega WHERE nombre_producto = 'Bebida lata');

INSERT INTO inventario_cocina (nombre_producto, unidad, cantidad, stock_minimo)
SELECT 'Carne porcionada', 'porcion', 20, 5
WHERE NOT EXISTS (SELECT 1 FROM inventario_cocina WHERE nombre_producto = 'Carne porcionada');

INSERT INTO inventario_cocina (nombre_producto, unidad, cantidad, stock_minimo)
SELECT 'Pan churrasco', 'unidad', 30, 5
WHERE NOT EXISTS (SELECT 1 FROM inventario_cocina WHERE nombre_producto = 'Pan churrasco');

INSERT INTO inventario_cocina (nombre_producto, unidad, cantidad, stock_minimo)
SELECT 'Bebida lata', 'unidad', 24, 6
WHERE NOT EXISTS (SELECT 1 FROM inventario_cocina WHERE nombre_producto = 'Bebida lata');

INSERT INTO productos_venta (nombre, precio, activo)
SELECT 'Churrasco', 5000, TRUE
WHERE NOT EXISTS (SELECT 1 FROM productos_venta WHERE nombre = 'Churrasco');

INSERT INTO productos_venta (nombre, precio, activo)
SELECT 'Bebida lata', 1500, TRUE
WHERE NOT EXISTS (SELECT 1 FROM productos_venta WHERE nombre = 'Bebida lata');

INSERT INTO recetas (producto_venta_id, inventario_cocina_id, cantidad_necesaria)
SELECT p.id, i.id, 1
FROM productos_venta p, inventario_cocina i
WHERE p.nombre = 'Churrasco'
  AND i.nombre_producto = 'Carne porcionada'
  AND NOT EXISTS (
    SELECT 1 FROM recetas r
    WHERE r.producto_venta_id = p.id
      AND r.inventario_cocina_id = i.id
  );

INSERT INTO recetas (producto_venta_id, inventario_cocina_id, cantidad_necesaria)
SELECT p.id, i.id, 1
FROM productos_venta p, inventario_cocina i
WHERE p.nombre = 'Churrasco'
  AND i.nombre_producto = 'Pan churrasco'
  AND NOT EXISTS (
    SELECT 1 FROM recetas r
    WHERE r.producto_venta_id = p.id
      AND r.inventario_cocina_id = i.id
  );

INSERT INTO recetas (producto_venta_id, inventario_cocina_id, cantidad_necesaria)
SELECT p.id, i.id, 1
FROM productos_venta p, inventario_cocina i
WHERE p.nombre = 'Bebida lata'
  AND i.nombre_producto = 'Bebida lata'
  AND NOT EXISTS (
    SELECT 1 FROM recetas r
    WHERE r.producto_venta_id = p.id
      AND r.inventario_cocina_id = i.id
  );
