const express = require('express');
const auth = require('../middleware/auth.middleware');
const controller = require('../controllers/inventario.controller');

const router = express.Router();

/*
  Todas las rutas trabajan con el usuario autenticado.
*/

router.get('/bodega', auth, controller.listarBodega);
router.post('/bodega', auth, controller.crearBodega);
router.put('/bodega/:id', auth, controller.actualizarBodega);
router.delete('/bodega/:id', auth, controller.eliminarBodega);

router.get('/cocina', auth, controller.listarCocina);
router.post('/cocina', auth, controller.crearCocina);
router.put('/cocina/:id', auth, controller.actualizarCocina);
router.delete('/cocina/:id', auth, controller.eliminarCocina);

router.post(
  '/traspasar',
  auth,
  controller.traspasarBodegaACocina
);

module.exports = router;