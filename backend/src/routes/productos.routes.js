const express = require('express');
const auth = require('../middleware/auth.middleware');
const controller = require('../controllers/productos.controller');

const router = express.Router();

router.get('/productos', auth, controller.listarProductos);
router.post('/productos', auth, controller.crearProducto);
router.put('/productos/:id', auth, controller.actualizarProducto);
router.delete('/productos/:id', auth, controller.eliminarProducto);

router.get('/recetas', auth, controller.listarRecetas);
router.post('/recetas', auth, controller.crearReceta);
router.delete('/recetas/:id', auth, controller.eliminarReceta);

module.exports = router;
