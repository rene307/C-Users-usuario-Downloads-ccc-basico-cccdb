const express = require('express');

const auth =
  require('../middleware/auth.middleware');

const controller =
  require('../controllers/proveedores.controller');


const router = express.Router();


/* =========================================================
   PROVEEDORES
========================================================= */


/*
   GET /api/proveedores

   Lista los proveedores de la empresa
   del usuario autenticado.
*/
router.get(
  '/proveedores',
  auth,
  controller.listarProveedores
);


/*
   POST /api/proveedores

   Guarda:

   - proveedor
   - relación con materia prima
   - nombre de boleta
   - aliases
   - último precio
*/
router.post(
  '/proveedores',
  auth,
  controller.guardarProveedor
);


/*
   PUT /api/proveedores/:id

   Actualiza el registro seleccionado.

   El :id corresponde al ID de
   proveedor_materia_prima que devuelve
   GET /api/proveedores.
*/
router.put(
  '/proveedores/:id',
  auth,
  controller.actualizarProveedor
);


module.exports = router;
