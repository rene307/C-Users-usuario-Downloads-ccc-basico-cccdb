const { Pool } = require('pg');
require('dotenv').config();

const schemaFromEnv = process.env.DB_SCHEMA || 'ccc_basico';

function getSafeSchema(schemaName) {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
    return schemaName;
  }

  console.warn(`DB_SCHEMA inválido: ${schemaName}. Se usará ccc_basico.`);
  return 'ccc_basico';
}

const schema = getSafeSchema(schemaFromEnv);

if (!process.env.DATABASE_URL) {
  throw new Error('Falta DATABASE_URL en el archivo .env');
}

const dbUrl = new URL(process.env.DATABASE_URL);

const pool = new Pool({
  user: dbUrl.username,
  password: String(dbUrl.password),
  host: dbUrl.hostname,
  port: Number(dbUrl.port || 5432),
  database: dbUrl.pathname.replace('/', ''),
  options: `-c search_path=${schema},public`,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Error inesperado en PostgreSQL:', err);
});

module.exports = pool;
module.exports.schema = schema;