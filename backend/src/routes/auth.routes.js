const express = require('express');

const router = express.Router();

const {
  login,
  register
} = require('../controllers/auth.controller');


/* =========================================================
   LOGIN
========================================================= */

router.post(
  '/login',
  login
);


/* =========================================================
   REGISTRO
========================================================= */

router.post(
  '/register',
  register
);


module.exports = router;