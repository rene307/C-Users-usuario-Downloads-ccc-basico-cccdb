const express = require('express');
const auth = require('../middleware/auth.middleware');
const controller = require('../controllers/inventario.controller');

const router = express.Router();

router.get('/bodega', controller.listarBodega);
router.post('/bodega', controller.crearBodega);
router.put('/bodega/:id', controller.actualizarBodega);
router.delete('/bodega/:id', controller.eliminarBodega);

router.get('/cocina', auth, controller.listarCocina);
router.post('/cocina', auth, controller.crearCocina);
router.put('/cocina/:id', auth, controller.actualizarCocina);
router.delete('/cocina/:id', auth, controller.eliminarCocina);

router.post('/traspasar', auth, controller.traspasarBodegaACocina);

module.exports = router;