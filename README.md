# CCC Básico usando la misma base de datos CCC

Esta versión se conecta a la base de datos principal `ccc`, pero crea sus tablas dentro del schema `ccc_basico`.

Eso evita problemas porque:

- No borra tablas existentes.
- No pisa tablas antiguas del proyecto CCC.
- Permite migrar después con más orden.
- Puedes tener el MVP funcionando dentro de la misma base de datos.

## Estructura

```text
ccc-basico/
  backend/
    src/
    sql/schema.sql
    .env.example
  frontend/
    index.html
    app.js
    styles.css
```

## 1. Base de datos

Debes tener creada tu base de datos principal:

```sql
CREATE DATABASE ccc;
```

Si ya existe, no la crees de nuevo.

## 2. Archivo .env

Entra a `backend` y copia el archivo de ejemplo:

```powershell
cd backend
copy .env.example .env
```

Debe quedar así:

```env
PORT=3000
DATABASE_URL=postgres://postgres:123456@localhost:5432/ccc
DB_SCHEMA=ccc_basico
JWT_SECRET=ccc_basico_clave_secreta_cambiar
ADMIN_NAME=Administrador
ADMIN_EMAIL=admin@ccc.cl
ADMIN_PASSWORD=123456
DB_SSL=false
```

Cambia `123456` por la clave real de tu PostgreSQL si corresponde.

## 3. Instalar y ejecutar

```powershell
npm install
npm run dev
```

El backend crea automáticamente el schema y las tablas si no existen.

Luego abre:

```text
http://localhost:3000
```

## Usuario inicial

```text
Correo: admin@ccc.cl
Contraseña: 123456
```

## Verificación rápida

En el navegador puedes abrir:

```text
http://localhost:3000/api/health
```

Debe mostrar algo parecido a:

```json
{
  "message": "CCC Básico funcionando",
  "database": "ccc",
  "schema": "ccc_basico"
}
```

## Importante

No abras `frontend/index.html` directo desde Chrome.

Debes abrir siempre:

```text
http://localhost:3000
```

## Tablas creadas

Dentro de la base `ccc`, en el schema `ccc_basico`, se crean:

- usuarios
- inventario_bodega
- inventario_cocina
- productos_venta
- recetas
- ventas
- detalle_ventas

## Ejecutar SQL manualmente si quieres

No es obligatorio, porque el backend lo hace al iniciar. Pero también puedes ejecutarlo manualmente:

```powershell
psql -U postgres -d ccc -f backend/sql/schema.sql
```
