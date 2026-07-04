require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const pool = require('./config/db');
const initDatabase = require('./config/initDatabase');

const authRoutes = require('./routes/auth.routes');
const inventarioRoutes = require('./routes/inventario.routes');
const productosRoutes = require('./routes/productos.routes');
const ventasRoutes = require('./routes/ventas.routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  const db = await pool.query('SELECT current_database() AS database, current_schema() AS schema');

  res.json({
    message: 'CCC Básico funcionando',
    database: db.rows[0].database,
    schema: db.rows[0].schema,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api', inventarioRoutes);
app.use('/api', productosRoutes);
app.use('/api', ventasRoutes);

// Frontend estático DESPUÉS de las rutas API
app.use(express.static(path.join(__dirname, '../../frontend')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

async function crearAdminSiNoExiste() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@ccc.cl';
  const adminPassword = process.env.ADMIN_PASSWORD || '123456';
  const adminName = process.env.ADMIN_NAME || 'Administrador';

  const result = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [adminEmail]);

  if (result.rows.length === 0) {
    const hash = await bcrypt.hash(adminPassword, 10);

    await pool.query(
      `INSERT INTO usuarios (nombre, correo, password_hash, rol)
       VALUES ($1, $2, $3, 'admin')`,
      [adminName, adminEmail, hash]
    );

    console.log(`Usuario admin creado: ${adminEmail} / ${adminPassword}`);
  }
}

async function iniciarServidor() {
  try {
    const dbInfo = await pool.query('SELECT current_database() AS database, current_schema() AS schema');

    console.log(
      `Conexión a PostgreSQL correcta: BD=${dbInfo.rows[0].database}, schema=${dbInfo.rows[0].schema}`
    );

    await initDatabase();
    await crearAdminSiNoExiste();

    app.listen(PORT, () => {
      console.log(`Servidor CCC Básico en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exit(1);
  }
}

iniciarServidor();