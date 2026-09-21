// =========================================================
// ⚠️ OJO - CHEF TEMPORAL
// CONFIGURACIÓN SOLO PARA LA PRESENTACIÓN DE CCC-BÁSICO
//
// CUANDO TERMINE LA PRESENTACIÓN:
// BORRAR ESTE ARCHIVO COMPLETO.
//
// EL CHEF TIENE SOLO 3 ACCESOS:
// 1. Bodega
// 2. Cocina
// 3. Receta
// =========================================================

const CHEF_TEMPORAL = {

  email: 'chef@ccc.local',

  password: '123456',

  usuario: {

    id: 999999,

    nombre: 'Chef',

    email: 'chef@ccc.local',

    rol: 'chef',

    rol_id: 3,

    empresa_id: 1

  },

  // =======================================================
  // SOLO 3 ACCESOS - NO AGREGAR OTROS
  // =======================================================

  modulosPermitidos: [
    'bodega',
    'cocina',
    'receta'
  ]

};


// =========================================================
// VALIDAR ACCESO TEMPORAL
// =========================================================

function validarChefTemporal(
  email,
  password
) {

  return (

    String(email)
      .trim()
      .toLowerCase() ===
        CHEF_TEMPORAL.email

    &&

    String(password) ===
      CHEF_TEMPORAL.password

  );

}


module.exports = {

  CHEF_TEMPORAL,

  validarChefTemporal

};


// =========================================================
// ⚠️ FIN OJO - CHEF TEMPORAL
// =========================================================