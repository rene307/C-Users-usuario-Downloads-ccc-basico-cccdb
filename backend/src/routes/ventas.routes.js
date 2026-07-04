const express = require('express');
const auth = require('../middleware/auth.middleware');
const controller = require('../controllers/ventas.controller');

const router = express.Router();

router.get('/ventas/hoy', auth, controller.ventasHoy);
router.post('/ventas', auth, controller.crearVenta);

module.exports = router;
