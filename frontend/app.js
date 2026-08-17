const API_BASE = "http://localhost:3000/api";

let token =
  sessionStorage.getItem("ccc_token") || "";

let usuario = null;

try {
  usuario = JSON.parse(
    sessionStorage.getItem("ccc_usuario") || "null"
  );
} catch (error) {
  console.warn(
    "Sesión anterior inválida. Se limpiará el usuario guardado.",
    error
  );

  sessionStorage.removeItem(
    "ccc_usuario"
  );
}

let data = {
  bodega: [],
  cocina: [],
  productos: [],
  recetas: [],
  ventas: [],
  totalVentas: 0
};


/*
  =====================================================
  PROVEEDORES

  Los proveedores se cargan y guardan en PostgreSQL
  mediante:

  GET  /api/proveedores
  POST /api/proveedores

  Se mantiene el nombre proveedoresVisual porque
  la interfaz ya utiliza ese arreglo para renderizar.
  =====================================================
*/

let proveedoresVisual = [];

let aliasesProveedorVisual = [];

// ID del registro de proveedor que se está modificando.
// null = se está creando un registro nuevo.
let proveedorEditandoId = null;



document.addEventListener(
  "DOMContentLoaded",
  async () => {

    iniciarLogin();

    iniciarRegistro();

    iniciarNavegacion();

    iniciarBotones();


    if (
      token &&
      usuario
    ) {

      mostrarAplicacion();


      try {

        await cargarTodoDesdeBD();

      } catch (error) {

        console.error(error);

        cerrarSesion();

      }

    } else {

      mostrarLogin();

    }

  }
);



/* =====================================================
   UTILIDADES
===================================================== */


function $(id) {

  return document.getElementById(id);

}



function numero(valor) {

  return Number(valor) || 0;

}



function redondear(valor) {

  return (
    Math.round(
      (Number(valor) + Number.EPSILON) * 100
    ) / 100
  );

}



function moneda(valor) {

  return new Intl.NumberFormat(
    "es-CL",
    {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0
    }
  ).format(
    numero(valor)
  );

}



function formatearFecha(valor) {

  if (!valor) {
    return "";
  }


  return new Date(valor)
    .toLocaleString(
      "es-CL"
    );

}



function nombreMedioPago(valor) {

  const nombres = {

    efectivo:
      "Efectivo",

    debito:
      "Débito",

    credito:
      "Crédito",

    transferencia:
      "Transferencia"

  };


  return (
    nombres[valor] ||
    valor ||
    ""
  );

}



/* =====================================================
   PETICIONES API
===================================================== */


async function api(
  ruta,
  opciones = {},
  requiereToken = true
) {

  const headers = {

    ...(opciones.headers || {})

  };


  if (opciones.body) {

    headers["Content-Type"] =
      "application/json";

  }


  if (
    requiereToken &&
    token
  ) {

    headers.Authorization =
      `Bearer ${token}`;

  }


  const respuesta =
    await fetch(

      `${API_BASE}${ruta}`,

      {
        ...opciones,
        headers
      }

    );


  const texto =
    await respuesta.text();


  let resultado = {};


  if (texto) {

    try {

      resultado =
        JSON.parse(texto);

    } catch {

      resultado = {
        message:
          texto
      };

    }

  }


  if (!respuesta.ok) {

    throw new Error(

      resultado.message ||

      `Error HTTP ${respuesta.status}`

    );

  }


  return resultado;

}



/* =====================================================
   NORMALIZACIÓN
===================================================== */


function normalizarBodega(item) {

  return {

    id:
      Number(item.id),

    producto:
      item.nombre_producto || "",

    unidad:
      item.unidad || "",

    cantidad:
      numero(
        item.cantidad
      ),

    costo_total:
      numero(
        item.costo_total
      )

  };

}



function normalizarCocina(item) {

  return {

    id:
      Number(item.id),

    producto:
      item.nombre_producto || "",

    unidad:
      item.unidad || "",

    cantidad:
      numero(
        item.cantidad
      ),

    costo_unitario:
      numero(
        item.costo_unitario
      ),

    costo_total:
      numero(
        item.costo_total
      ),

    stock_minimo:
      numero(
        item.stock_minimo
      )

  };

}



function normalizarProducto(item) {

  return {

    id:
      Number(item.id),

    nombre:
      item.nombre || "",

    precio:
      numero(
        item.precio
      ),

    activo:
      item.activo !== false

  };

}



function normalizarReceta(item) {

  return {

    id:
      Number(
        item.id
      ),

    producto_venta_id:
      Number(
        item.producto_venta_id
      ),

    producto_venta:
      item.producto_venta || "",

    inventario_cocina_id:
      Number(
        item.inventario_cocina_id
      ),

    ingrediente:
      item.ingrediente || "",

    unidad:
      item.unidad || "",

    cantidad_necesaria:
      numero(
        item.cantidad_necesaria
      )

  };

}



function normalizarProveedor(item) {

  return {

    id:
      Number(item.id),

    proveedorId:
      Number(item.proveedor_id),

    proveedor:
      item.proveedor || "",

    rut:
      item.rut || "",

    contacto:
      item.contacto || "",

    telefono:
      item.telefono || "",

    correo:
      item.correo || "",

    condicionPago:
      item.condicion_pago || "Contado",

    estado:
      item.estado ||
      item.proveedor_estado ||
      "Activo",

    nombreBoleta:
      item.nombre_boleta || "",

    productoMaestroId:
      Number(item.materia_prima_id),

    productoMaestro:
      item.producto_maestro || "",

    unidad:
      item.unidad || "",

    precio:
      numero(item.precio),

    aliases:
      Array.isArray(item.aliases)
        ? item.aliases
        : []

  };

}



/* =====================================================
   CARGA DESDE POSTGRESQL
===================================================== */


async function cargarTodoDesdeBD() {

  /*
    Los módulos principales se cargan juntos.

    Proveedores se carga aparte para que un problema
    en /api/proveedores NO impida entrar a CCC Básico
    ni cierre la sesión.
  */

  const [

    bodega,

    cocina,

    productos,

    recetas,

    ventasHoy

  ] = await Promise.all([

    api("/bodega"),

    api("/cocina"),

    api("/productos"),

    api("/recetas"),

    api("/ventas/hoy")

  ]);


  data.bodega =
    bodega.map(
      normalizarBodega
    );


  data.cocina =
    cocina.map(
      normalizarCocina
    );


  data.productos =
    productos.map(
      normalizarProducto
    );


  data.recetas =
    recetas.map(
      normalizarReceta
    );


  data.totalVentas =
    numero(
      ventasHoy.total_dia
    );


  const ventasPorId =
    new Map();


  ventasHoy.ventas.forEach(

    venta => {

      ventasPorId.set(

        Number(
          venta.id
        ),

        venta

      );

    }

  );


  data.ventas =
    ventasHoy.detalles.map(

      detalle => {

        const venta =
          ventasPorId.get(

            Number(
              detalle.venta_id
            )

          );


        return {

          id:
            Number(
              detalle.id
            ),

          producto:
            detalle.producto,

          cantidad:
            numero(
              detalle.cantidad
            ),

          medio_pago:
            venta?.medio_pago || "",

          total:
            numero(
              detalle.subtotal
            ),

          fecha:
            venta?.fecha || ""

        };

      }

    );


  /*
    PROVEEDORES

    Se consulta aparte. Si esta ruta presenta un error,
    el resto de CCC sigue funcionando.
  */

  try {

    const proveedores =
      await api(
        "/proveedores"
      );


    proveedoresVisual =
      Array.isArray(proveedores)

        ? proveedores.map(
            normalizarProveedor
          )

        : [];


  } catch (error) {

    console.error(
      "Error cargando proveedores:",
      error
    );


    proveedoresVisual = [];

  }


  renderizarTodo();

}



/* =====================================================
   LOGIN / REGISTRO
===================================================== */


function iniciarLogin() {

  const formulario =
    $("loginForm");


  if (!formulario) {
    return;
  }


  formulario.addEventListener(

    "submit",

    async evento => {

      evento.preventDefault();


      const correo =
        $("correo")
          ?.value
          .trim() || "";


      const password =
        $("password")
          ?.value || "";


      if (
        !correo ||
        !password
      ) {

        alert(
          "Ingresa correo y contraseña"
        );

        return;

      }


      try {

        const resultado =
          await api(

            "/auth/login",

            {

              method:
                "POST",

              body:
                JSON.stringify({

                  correo,

                  password

                })

            },

            false

          );


        token =
          resultado.token || "";


        usuario =
          resultado.usuario ||
          resultado.user ||
          null;


        if (
          !token ||
          !usuario
        ) {

          throw new Error(
            "El servidor no devolvió una sesión válida"
          );

        }


        guardarSesion();


        mostrarAplicacion();


        await cargarTodoDesdeBD();


        mostrarVista(
          "vistaResumen"
        );


        activarBoton(
          "btnResumen"
        );


      } catch (error) {

        console.error(error);

        alert(
          error.message
        );

      }

    }

  );

}



function iniciarRegistro() {

  const botonMostrar =
    $("btnMostrarRegistro");

  const botonVolver =
    $("btnVolverLogin");

  const formulario =
    $("registroForm");


  botonMostrar
    ?.addEventListener(

      "click",

      mostrarRegistro

    );


  botonVolver
    ?.addEventListener(

      "click",

      mostrarLogin

    );


  if (!formulario) {
    return;
  }


  formulario.addEventListener(

    "submit",

    async evento => {

      evento.preventDefault();


      const nombre =
        $("registroNombre")
          ?.value
          .trim() || "";


      const nombreEmpresa =
        $("registroEmpresa")
          ?.value
          .trim() || "";


      const rutEmpresa =
        $("registroRut")
          ?.value
          .trim() || "";


      const whatsapp =
        $("registroWhatsapp")
          ?.value
          .trim() || "";


      const direccion =
        $("registroDireccion")
          ?.value
          .trim() || "";


      const email =
        $("registroEmail")
          ?.value
          .trim()
          .toLowerCase() || "";


      const password =
        $("registroPassword")
          ?.value || "";


      const confirmarPassword =
        $("registroConfirmarPassword")
          ?.value || "";


      if (
        !nombre ||
        !nombreEmpresa ||
        !rutEmpresa ||
        !whatsapp ||
        !email ||
        !password
      ) {

        mostrarMensajeRegistro(
          "Completa todos los datos obligatorios",
          true
        );

        return;

      }


      if (password.length < 6) {

        mostrarMensajeRegistro(
          "La contraseña debe tener al menos 6 caracteres",
          true
        );

        return;

      }


      if (
        password !==
        confirmarPassword
      ) {

        mostrarMensajeRegistro(
          "Las contraseñas no coinciden",
          true
        );

        return;

      }


      try {

        mostrarMensajeRegistro(
          "Creando cuenta...",
          false
        );


        const resultado =
          await api(

            "/auth/register",

            {

              method:
                "POST",

              body:
                JSON.stringify({

                  nombre,

                  nombreEmpresa,

                  rutEmpresa,

                  whatsapp,

                  direccion,

                  email,

                  password,

                  confirmarPassword

                })

            },

            false

          );


        token =
          resultado.token || "";


        usuario =
          resultado.usuario ||
          resultado.user ||
          null;


        if (
          !token ||
          !usuario
        ) {

          throw new Error(
            "La cuenta se creó, pero el servidor no devolvió una sesión válida"
          );

        }


        guardarSesion();


        mostrarMensajeRegistro(
          "Cuenta creada correctamente",
          false
        );


        formulario.reset();


        mostrarAplicacion();


        await cargarTodoDesdeBD();


        mostrarVista(
          "vistaResumen"
        );


        activarBoton(
          "btnResumen"
        );


      } catch (error) {

        console.error(
          "Error registro:",
          error
        );


        mostrarMensajeRegistro(
          error.message,
          true
        );

      }

    }

  );

}



function guardarSesion() {

  sessionStorage.setItem(

    "ccc_token",

    token

  );


  sessionStorage.setItem(

    "ccc_usuario",

    JSON.stringify(
      usuario
    )

  );

}



function mostrarMensajeRegistro(
  mensaje,
  esError = false
) {

  const campo =
    $("registroMensaje");


  if (!campo) {
    return;
  }


  campo.textContent =
    mensaje || "";


  campo.style.display =
    mensaje
      ? "block"
      : "none";


  campo.style.color =
    esError
      ? "#b42318"
      : "#067647";

}



function mostrarAplicacion() {

  if ($("loginView")) {

    $("loginView")
      .style
      .display =
        "none";

  }


  if ($("registerView")) {

    $("registerView")
      .style
      .display =
        "none";

  }


  if ($("appView")) {

    $("appView")
      .style
      .display =
        "flex";

  }


  if ($("rolUsuario")) {

    $("rolUsuario")
      .textContent =
        usuario?.rol || "";

  }


  if ($("nombreUsuario")) {

    $("nombreUsuario")
      .textContent =
        usuario?.nombre || "";

  }

}



function mostrarLogin() {

  if ($("appView")) {

    $("appView")
      .style
      .display =
        "none";

  }


  if ($("registerView")) {

    $("registerView")
      .style
      .display =
        "none";

  }


  if ($("loginView")) {

    $("loginView")
      .style
      .display =
        "flex";

  }


  mostrarMensajeRegistro(
    "",
    false
  );

}



function mostrarRegistro() {

  if ($("appView")) {

    $("appView")
      .style
      .display =
        "none";

  }


  if ($("loginView")) {

    $("loginView")
      .style
      .display =
        "none";

  }


  if ($("registerView")) {

    $("registerView")
      .style
      .display =
        "flex";

  }


  mostrarMensajeRegistro(
    "",
    false
  );


  $("registroNombre")
    ?.focus();

}



function cerrarSesion() {

  token = "";

  usuario = null;


  sessionStorage.removeItem(
    "ccc_token"
  );


  sessionStorage.removeItem(
    "ccc_usuario"
  );


  data = {

    bodega: [],

    cocina: [],

    productos: [],

    recetas: [],

    ventas: [],

    totalVentas: 0

  };


  proveedoresVisual = [];

  aliasesProveedorVisual = [];


  mostrarLogin();

}



/* =====================================================
   NAVEGACIÓN
===================================================== */


function iniciarNavegacion() {

  const botones = [

    {
      id:
        "btnResumen",

      vista:
        "vistaResumen"
    },

    {
      id:
        "btnBodega",

      vista:
        "vistaBodega"
    },

    {
      id:
        "btnProveedores",

      vista:
        "vistaProveedores"
    },

    {
      id:
        "btnCocina",

      vista:
        "vistaCocina"
    },

    {
      id:
        "btnProductos",

      vista:
        "vistaProductos"
    },

    {
      id:
        "btnVentas",

      vista:
        "vistaVentas"
    }

  ];


  botones.forEach(

    item => {

      $(item.id)
        ?.addEventListener(

          "click",

          async () => {

            try {

              await cargarTodoDesdeBD();


              mostrarVista(
                item.vista
              );


              activarBoton(
                item.id
              );


            } catch (error) {

              console.error(error);

              alert(
                error.message
              );

            }

          }

        );

    }

  );


  $("btnSalir")
    ?.addEventListener(

      "click",

      cerrarSesion

    );

}



function mostrarVista(idVista) {

  const vistas = [

    "vistaResumen",

    "vistaBodega",

    "vistaProveedores",

    "vistaCocina",

    "vistaProductos",

    "vistaVentas"

  ];


  vistas.forEach(

    id => {

      const vista =
        $(id);


      if (vista) {

        vista.style.display =

          id === idVista

            ? "block"

            : "none";

      }

    }

  );

}



function activarBoton(idBoton) {

  const botones = [

    "btnResumen",

    "btnBodega",

    "btnProveedores",

    "btnCocina",

    "btnProductos",

    "btnVentas"

  ];


  botones.forEach(

    id => {

      $(id)
        ?.classList
        .toggle(

          "active",

          id === idBoton

        );

    }

  );

}



/* =====================================================
   BOTONES
===================================================== */


function iniciarBotones() {


  $("btnActualizar")
    ?.addEventListener(

      "click",

      async () => {

        try {

          await cargarTodoDesdeBD();

        } catch (error) {

          alert(
            error.message
          );

        }

      }

    );



  $("btnAgregarBodega")
    ?.addEventListener(

      "click",

      agregarBodega

    );



  $("btnAgregarCocina")
    ?.addEventListener(

      "click",

      agregarCocina

    );



  $("btnCrearProductoVenta")
    ?.addEventListener(

      "click",

      crearProductoVenta

    );



  $("btnAgregarIngrediente")
    ?.addEventListener(

      "click",

      agregarFilaIngrediente

    );



  $("btnAgregarReceta")
    ?.addEventListener(

      "click",

      agregarReceta

    );



  $("ingredientesReceta")
    ?.addEventListener(

      "input",

      actualizarCostoConstructorReceta

    );



  $("ingredientesReceta")
    ?.addEventListener(

      "change",

      actualizarCostoConstructorReceta

    );



  $("ingredientesReceta")
    ?.addEventListener(

      "click",

      accionesIngredientesReceta

    );



  asegurarPrimeraFilaReceta();



  $("btnRegistrarVenta")
    ?.addEventListener(

      "click",

      registrarVenta

    );



  $("tablaBodega")
    ?.addEventListener(

      "click",

      accionesBodega

    );



  $("tablaCocina")
    ?.addEventListener(

      "click",

      accionesCocina

    );



  $("tablaProductos")
    ?.addEventListener(

      "click",

      accionesProductos

    );



  /* =================================================
     PROVEEDORES
  ================================================= */


  $("btnAgregarAliasProveedor")
    ?.addEventListener(

      "click",

      agregarAliasProveedorVisual

    );



  $("proveedorAlias")
    ?.addEventListener(

      "keydown",

      evento => {

        if (
          evento.key ===
          "Enter"
        ) {

          evento.preventDefault();

          agregarAliasProveedorVisual();

        }

      }

    );



  $("proveedorNombreBoleta")
    ?.addEventListener(

      "input",

      actualizarPreviewProveedorVisual

    );



  $("proveedorProductoMaestro")
    ?.addEventListener(

      "change",

      () => {

        completarUnidadProveedorDesdeBodega();

        actualizarPreviewProveedorVisual();

      }

    );



  $("btnGuardarProveedorVisual")
    ?.addEventListener(

      "click",

      guardarProveedorVisual

    );



  $("btnLimpiarProveedorVisual")
    ?.addEventListener(

      "click",

      limpiarFormularioProveedorVisual

    );



  $("proveedorAliasLista")
    ?.addEventListener(

      "click",

      accionesAliasProveedorVisual

    );



  $("tablaProveedoresVisual")
    ?.addEventListener(

      "click",

      accionesTablaProveedoresVisual

    );


  renderAliasesProveedorVisual();

  actualizarPreviewProveedorVisual();

}



/* =====================================================
   PROVEEDORES
   POSTGRESQL
===================================================== */


function normalizarTextoProveedor(valor) {

  return String(
    valor || ""
  )
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .trim()
    .replace(
      /\s+/g,
      " "
    );

}



function escaparHTML(valor) {

  return String(
    valor ?? ""
  )

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );

}



function obtenerProductoMaestroProveedor() {

  const id =
    Number(
      $("proveedorProductoMaestro")
        ?.value
    );


  if (!id) {

    return null;

  }


  return (

    data.bodega.find(

      item =>
        item.id === id

    ) || null

  );

}



function renderSelectProductoMaestroProveedor() {

  const select =
    $("proveedorProductoMaestro");


  if (!select) {

    return;

  }


  const valorAnterior =
    select.value;


  select.innerHTML = `

    <option value="">
      Seleccionar producto de bodega
    </option>

  `;


  data.bodega.forEach(

    item => {

      select.innerHTML += `

        <option value="${item.id}">

          ${escaparHTML(item.producto)}

        </option>

      `;

    }

  );


  const sigueExistiendo =
    data.bodega.some(

      item =>

        String(item.id) ===
        String(valorAnterior)

    );


  if (sigueExistiendo) {

    select.value =
      valorAnterior;

  }


  actualizarPreviewProveedorVisual();

}



function completarUnidadProveedorDesdeBodega() {

  const producto =
    obtenerProductoMaestroProveedor();


  const campoUnidad =
    $("proveedorUnidad");


  if (

    producto &&

    campoUnidad &&

    !campoUnidad.value.trim()

  ) {

    campoUnidad.value =
      producto.unidad || "";

  }

}



function agregarAliasProveedorVisual() {

  const campo =
    $("proveedorAlias");


  if (!campo) {

    return;

  }


  const nuevos =
    campo.value

      .split(
        /[,;]+/
      )

      .map(
        item =>
          item.trim()
      )

      .filter(
        Boolean
      );


  if (
    nuevos.length === 0
  ) {

    return;

  }


  nuevos.forEach(

    alias => {

      const clave =
        normalizarTextoProveedor(
          alias
        );


      const existe =
        aliasesProveedorVisual.some(

          item =>

            normalizarTextoProveedor(
              item
            ) === clave

        );


      if (!existe) {

        aliasesProveedorVisual.push(
          alias
        );

      }

    }

  );


  campo.value = "";


  renderAliasesProveedorVisual();

}



function accionesAliasProveedorVisual(
  evento
) {

  const boton =
    evento.target.closest(
      "button[data-alias-index]"
    );


  if (!boton) {

    return;

  }


  const indice =
    Number(
      boton.dataset.aliasIndex
    );


  if (

    Number.isNaN(indice) ||

    indice < 0 ||

    indice >=
      aliasesProveedorVisual.length

  ) {

    return;

  }


  aliasesProveedorVisual.splice(

    indice,

    1

  );


  renderAliasesProveedorVisual();

}



function renderAliasesProveedorVisual() {

  const contenedor =
    $("proveedorAliasLista");


  if (!contenedor) {

    return;

  }


  if (
    aliasesProveedorVisual.length === 0
  ) {

    contenedor.innerHTML = `

      <span class="proveedores-ayuda">

        Sin alias agregados.

      </span>

    `;


    return;

  }


  contenedor.innerHTML =
    aliasesProveedorVisual

      .map(

        (
          alias,
          indice
        ) => `

          <span class="proveedores-chip">

            ${escaparHTML(alias)}

            <button
              type="button"
              data-alias-index="${indice}"
              title="Quitar alias"
            >
              ×
            </button>

          </span>

        `

      )

      .join("");

}



function actualizarPreviewProveedorVisual() {

  const nombreBoleta =
    $("proveedorNombreBoleta")
      ?.value
      .trim() || "";


  const productoMaestro =
    obtenerProductoMaestroProveedor();


  const previewBoleta =
    $("proveedorPreviewBoleta");


  const previewMaestro =
    $("proveedorPreviewMaestro");


  const previewEstado =
    $("proveedorPreviewEstado");


  if (previewBoleta) {

    previewBoleta.textContent =
      nombreBoleta || "—";

  }


  if (previewMaestro) {

    previewMaestro.textContent =
      productoMaestro?.producto || "—";

  }


  if (previewEstado) {

    const compatible =
      Boolean(

        nombreBoleta &&

        productoMaestro

      );


    previewEstado.textContent =

      compatible

        ? "Vinculado al producto maestro"

        : "Esperando relación";


    previewEstado.classList.toggle(

      "compatible",

      compatible

    );

  }

}



function existeConflictoNombreProveedor(

  proveedorNombre,

  productoMaestroId,

  nombreBoleta,

  aliases,

  registroIgnorarId = null

) {

  const proveedorClave =
    normalizarTextoProveedor(
      proveedorNombre
    );


  const nombresNuevos =
    new Set(

      [

        nombreBoleta,

        ...aliases

      ]

        .map(
          normalizarTextoProveedor
        )

        .filter(
          Boolean
        )

    );


  return proveedoresVisual.some(

    registro => {


      if (

        registroIgnorarId !== null &&

        Number(registro.id) ===
        Number(registroIgnorarId)

      ) {

        return false;

      }


      if (

        normalizarTextoProveedor(
          registro.proveedor
        ) !==
        proveedorClave

      ) {

        return false;

      }



      if (

        registro.productoMaestroId ===
        productoMaestroId

      ) {

        return false;

      }



      const nombresGuardados =
        new Set(

          [

            registro.nombreBoleta,

            ...registro.aliases

          ]

            .map(
              normalizarTextoProveedor
            )

            .filter(
              Boolean
            )

        );


      return [

        ...nombresNuevos

      ].some(

        nombre =>

          nombresGuardados.has(
            nombre
          )

      );

    }

  );

}



async function guardarProveedorVisual() {

  const proveedor =
    $("proveedorNombre")
      ?.value
      .trim() || "";


  const rut =
    $("proveedorRut")
      ?.value
      .trim() || "";


  const contacto =
    $("proveedorContacto")
      ?.value
      .trim() || "";


  const telefono =
    $("proveedorTelefono")
      ?.value
      .trim() || "";


  const correo =
    $("proveedorCorreo")
      ?.value
      .trim() || "";


  const condicionPago =
    $("proveedorCondicionPago")
      ?.value || "Contado";


  const estado =
    $("proveedorEstado")
      ?.value || "Activo";


  const nombreBoleta =
    $("proveedorNombreBoleta")
      ?.value
      .trim() || "";


  const unidad =
    $("proveedorUnidad")
      ?.value
      .trim() || "";


  const precio =
    numero(
      $("proveedorPrecio")
        ?.value
    );


  const productoMaestro =
    obtenerProductoMaestroProveedor();



  if (!proveedor) {

    alert(
      "Ingresa el nombre del proveedor"
    );

    return;

  }



  if (!nombreBoleta) {

    alert(
      "Ingresa el nombre exacto de la boleta"
    );

    return;

  }



  if (!productoMaestro) {

    alert(
      "Selecciona el producto maestro CCC"
    );

    return;

  }



  if (!unidad) {

    alert(
      "Ingresa la unidad del producto"
    );

    return;

  }



  if (precio < 0) {

    alert(
      "El precio no puede ser negativo"
    );

    return;

  }



  const conflicto =
    existeConflictoNombreProveedor(

      proveedor,

      productoMaestro.id,

      nombreBoleta,

      aliasesProveedorVisual,

      proveedorEditandoId

    );


  if (conflicto) {

    alert(

      "Hay una incongruencia: " +

      "ese nombre de boleta o alias " +

      "ya está vinculado a otro producto maestro " +

      "para este proveedor. " +

      "Un solo producto maestro debe mandar."

    );


    return;

  }



  try {

    const editando =
      proveedorEditandoId !== null;


    await api(

      editando
        ? `/proveedores/${proveedorEditandoId}`
        : "/proveedores",

      {

        method:
          editando ? "PUT" : "POST",

        body:
          JSON.stringify({

            proveedor,

            rut,

            contacto,

            telefono,

            correo,

            condicion_pago:
              condicionPago,

            estado,

            materia_prima_id:
              productoMaestro.id,

            nombre_boleta:
              nombreBoleta,

            unidad,

            precio,

            aliases:
              [
                ...aliasesProveedorVisual
              ]

          })

      }

    );


    await cargarTodoDesdeBD();


    const aviso =
      $("proveedorAvisoVisual");


    if (aviso) {

      aviso.style.display =
        "block";


      window.setTimeout(

        () => {

          aviso.style.display =
            "none";

        },

        2600

      );

    }


    limpiarFormularioProveedorVisual(
      true
    );


  } catch (error) {

    console.error(
      "Error guardar proveedor:",
      error
    );


    alert(
      error.message
    );

  }

}



function limpiarFormularioProveedorVisual(

  mantenerProveedor = false

) {

  proveedorEditandoId = null;


  const botonGuardar =
    $("btnGuardarProveedorVisual");


  if (botonGuardar) {

    botonGuardar.textContent =
      "Guardar proveedor";

  }


  const camposProveedor = [

    "proveedorNombre",

    "proveedorRut",

    "proveedorContacto",

    "proveedorTelefono",

    "proveedorCorreo",

    "proveedorFechaCompra"

  ];


  if (!mantenerProveedor) {

    camposProveedor.forEach(

      id => {

        if ($(id)) {

          $(id).value = "";

        }

      }

    );


    if (
      $("proveedorCondicionPago")
    ) {

      $("proveedorCondicionPago")
        .value =
          "Contado";

    }


    if (
      $("proveedorEstado")
    ) {

      $("proveedorEstado")
        .value =
          "Activo";

    }

  }



  [

    "proveedorNombreBoleta",

    "proveedorUnidad",

    "proveedorPrecio",

    "proveedorAlias"

  ].forEach(

    id => {

      if ($(id)) {

        $(id).value = "";

      }

    }

  );



  if (
    $("proveedorProductoMaestro")
  ) {

    $("proveedorProductoMaestro")
      .value =
        "";

  }



  aliasesProveedorVisual = [];


  renderAliasesProveedorVisual();

  actualizarPreviewProveedorVisual();

}



function accionesTablaProveedoresVisual(
  evento
) {

  const boton =
    evento.target.closest(
      "button[data-proveedor-id]"
    );


  if (!boton) {

    return;

  }


  const id =
    Number(
      boton.dataset.proveedorId
    );


  if (
    boton.dataset.action ===
    "editar"
  ) {

    editarProveedorVisual(id);

    return;

  }


  if (
    boton.dataset.action ===
    "eliminar"
  ) {

    alert(
      "El proveedor está guardado en PostgreSQL. " +
      "La eliminación se habilitará cuando conectemos " +
      "la ruta DELETE del backend."
    );

  }

}



function editarProveedorVisual(id) {

  const item =
    proveedoresVisual.find(
      registro =>
        Number(registro.id) === Number(id)
    );


  if (!item) {

    return;

  }


  proveedorEditandoId =
    Number(item.id);


  if ($("proveedorNombre")) {
    $("proveedorNombre").value = item.proveedor || "";
  }


  if ($("proveedorRut")) {
    $("proveedorRut").value = item.rut || "";
  }


  if ($("proveedorContacto")) {
    $("proveedorContacto").value = item.contacto || "";
  }


  if ($("proveedorTelefono")) {
    $("proveedorTelefono").value = item.telefono || "";
  }


  if ($("proveedorCorreo")) {
    $("proveedorCorreo").value = item.correo || "";
  }


  if ($("proveedorCondicionPago")) {
    $("proveedorCondicionPago").value =
      item.condicionPago || "Contado";
  }


  if ($("proveedorEstado")) {
    $("proveedorEstado").value =
      item.estado || "Activo";
  }


  if ($("proveedorNombreBoleta")) {
    $("proveedorNombreBoleta").value =
      item.nombreBoleta || "";
  }


  if ($("proveedorProductoMaestro")) {
    $("proveedorProductoMaestro").value =
      String(item.productoMaestroId || "");
  }


  if ($("proveedorUnidad")) {
    $("proveedorUnidad").value = item.unidad || "";
  }


  if ($("proveedorPrecio")) {
    $("proveedorPrecio").value = item.precio || 0;
  }


  aliasesProveedorVisual =
    Array.isArray(item.aliases)
      ? [...item.aliases]
      : [];


  renderAliasesProveedorVisual();

  actualizarPreviewProveedorVisual();


  const botonGuardar =
    $("btnGuardarProveedorVisual");


  if (botonGuardar) {

    botonGuardar.textContent =
      "Actualizar proveedor";

  }


  $("proveedorNombre")
    ?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

}



function renderProveedoresVisual() {

  const tbody =
    $("tablaProveedoresVisual");


  if (!tbody) {

    return;

  }


  if (
    proveedoresVisual.length === 0
  ) {

    tbody.innerHTML = `

      <tr>

        <td
          colspan="8"
          class="proveedores-tabla-vacia"
        >

          Sin proveedores agregados
          en esta vista.

        </td>

      </tr>

    `;


    return;

  }



  tbody.innerHTML =
    proveedoresVisual

      .map(

        item => `

          <tr>


            <td>

              <strong>

                ${escaparHTML(
                  item.proveedor
                )}

              </strong>


              ${
                item.rut

                  ? `
                    <div>

                      ${escaparHTML(
                        item.rut
                      )}

                    </div>
                  `

                  : ""
              }

            </td>



            <td>

              ${escaparHTML(
                item.nombreBoleta
              )}

            </td>



            <td>

              <strong>

                ${escaparHTML(
                  item.productoMaestro
                )}

              </strong>

            </td>



            <td>

              ${
                item.aliases.length

                  ? item.aliases

                      .map(
                        escaparHTML
                      )

                      .join(", ")

                  : "—"
              }

            </td>



            <td>

              ${escaparHTML(
                item.unidad
              )}

            </td>



            <td>

              ${moneda(
                item.precio
              )}

            </td>



            <td>

              ${escaparHTML(
                item.estado
              )}

            </td>



            <td>

              <button
                type="button"
                data-action="editar"
                data-proveedor-id="${item.id}"
              >
                Modificar
              </button>


              <button
                type="button"
                class="eliminar proveedores-eliminar"
                data-action="eliminar"
                data-proveedor-id="${item.id}"
              >
                Eliminar
              </button>

            </td>


          </tr>

        `

      )

      .join("");

}



/* =====================================================
   BODEGA
===================================================== */


async function agregarBodega() {

  const producto =
    $("bodegaProducto")
      .value
      .trim();


  const unidad =
    $("bodegaUnidad")
      .value
      .trim();


  const cantidad =
    numero(
      $("bodegaCantidad")
        .value
    );


  const costo =
    numero(
      $("bodegaCosto")
        .value
    );


  if (

    !producto ||

    !unidad ||

    cantidad <= 0 ||

    costo <= 0

  ) {

    alert(
      "Completa los datos de bodega"
    );


    return;

  }


  try {

    await api(

      "/bodega",

      {

        method:
          "POST",

        body:
          JSON.stringify({

            nombre_producto:
              producto,

            unidad,

            cantidad,

            costo_total:
              costo

          })

      }

    );


    $("bodegaProducto")
      .value = "";


    $("bodegaUnidad")
      .value = "";


    $("bodegaCantidad")
      .value = "";


    $("bodegaCosto")
      .value = "";


    await cargarTodoDesdeBD();


  } catch (error) {

    console.error(error);

    alert(
      error.message
    );

  }

}



function accionesBodega(evento) {

  const boton =
    evento.target.closest(
      "button[data-action]"
    );


  if (!boton) {
    return;
  }


  const id =
    Number(
      boton.dataset.id
    );


  if (

    boton.dataset.action ===
    "editar"

  ) {

    editarBodega(id);

  }


  if (

    boton.dataset.action ===
    "eliminar"

  ) {

    eliminarBodega(id);

  }

}



async function editarBodega(id) {

  const item =
    data.bodega.find(

      producto =>
        producto.id === id

    );


  if (!item) {

    return;

  }


  const producto =
    prompt(

      "Producto",

      item.producto

    );


  if (
    producto === null
  ) {

    return;

  }



  const unidad =
    prompt(

      "Unidad",

      item.unidad

    );


  if (
    unidad === null
  ) {

    return;

  }



  const cantidad =
    prompt(

      "Cantidad",

      item.cantidad

    );


  if (
    cantidad === null
  ) {

    return;

  }



  const costo =
    prompt(

      "Costo total",

      item.costo_total

    );


  if (
    costo === null
  ) {

    return;

  }



  try {

    await api(

      `/bodega/${id}`,

      {

        method:
          "PUT",

        body:
          JSON.stringify({

            nombre_producto:
              producto.trim(),

            unidad:
              unidad.trim(),

            cantidad:
              numero(
                cantidad
              ),

            costo_total:
              numero(
                costo
              )

          })

      }

    );


    await cargarTodoDesdeBD();


  } catch (error) {

    console.error(error);

    alert(
      error.message
    );

  }

}



async function eliminarBodega(id) {

  if (

    !confirm(
      "¿Eliminar producto de bodega?"
    )

  ) {

    return;

  }


  try {

    await api(

      `/bodega/${id}`,

      {
        method:
          "DELETE"
      }

    );


    await cargarTodoDesdeBD();


  } catch (error) {

    console.error(error);

    alert(
      error.message
    );

  }

}



/* =====================================================
   COCINA
===================================================== */


async function agregarCocina() {

  const bodegaId =
    Number(
      $("selectBodegaCocina")
        .value
    );


  const textoGramos =
    $("cocinaUnidad")
      .value
      .trim();


  const gramosPorPorcion =
    Number(

      textoGramos

        .replace(
          /[^0-9.,]/g,
          ""
        )

        .replace(
          ",",
          "."
        )

    );


  const bodega =
    data.bodega.find(

      item =>
        item.id ===
        bodegaId

    );


  if (!bodega) {

    alert(
      "Selecciona un producto de bodega"
    );


    return;

  }



  if (
    gramosPorPorcion <= 0
  ) {

    alert(
      "Ingresa los gramos por porción"
    );


    return;

  }



  const unidad =
    bodega.unidad
      .toLowerCase()
      .trim();


  let gramosDisponibles = 0;



  if (

    unidad === "kg" ||

    unidad === "kilo" ||

    unidad === "kilos" ||

    unidad === "kilogramo" ||

    unidad === "kilogramos"

  ) {

    gramosDisponibles =
      bodega.cantidad * 1000;


  } else if (

    unidad === "g" ||

    unidad === "gr" ||

    unidad === "gramo" ||

    unidad === "gramos"

  ) {

    gramosDisponibles =
      bodega.cantidad;


  } else {

    alert(
      "La unidad de bodega debe ser kg o g"
    );


    return;

  }



  const cantidadPorciones =
    Math.floor(

      gramosDisponibles /

      gramosPorPorcion

    );



  if (
    cantidadPorciones <= 0
  ) {

    alert(
      "No alcanza para una porción"
    );


    return;

  }



  const gramosUtilizados =

    cantidadPorciones *

    gramosPorPorcion;



  const usaKilogramos =

    unidad === "kg" ||

    unidad === "kilo" ||

    unidad === "kilos" ||

    unidad === "kilogramo" ||

    unidad === "kilogramos";



  const cantidadBodegaUtilizada =

    usaKilogramos

      ? gramosUtilizados / 1000

      : gramosUtilizados;



  const nombreCocina =
    bodega.producto;



  const unidadCocina =
    `${gramosPorPorcion} g`;



  const existente =
    data.cocina.find(

      item =>

        item.producto
          .toLowerCase() ===
        nombreCocina
          .toLowerCase()

        &&

        item.unidad
          .toLowerCase() ===
        unidadCocina
          .toLowerCase()

    );



  try {

    await api(

      "/traspasar",

      {

        method:
          "POST",

        body:
          JSON.stringify({

            bodega_id:
              bodega.id,

            cocina_id:
              existente?.id || null,

            nombre_cocina:
              nombreCocina,

            unidad_cocina:
              unidadCocina,

            cantidad_bodega:
              cantidadBodegaUtilizada,

            cantidad_cocina:
              cantidadPorciones

          })

      }

    );



    $("selectBodegaCocina")
      .value = "";


    $("cocinaUnidad")
      .value = "";


    await cargarTodoDesdeBD();



    alert(

      `${nombreCocina}: se guardaron ` +

      `${cantidadPorciones} porciones de ` +

      `${unidadCocina}`

    );


  } catch (error) {

    console.error(error);

    alert(
      error.message
    );

  }

}



function accionesCocina(evento) {

  const boton =
    evento.target.closest(
      "button[data-action]"
    );


  if (!boton) {

    return;

  }


  const id =
    Number(
      boton.dataset.id
    );


  if (

    boton.dataset.action ===
    "editar"

  ) {

    editarCocina(id);

  }


  if (

    boton.dataset.action ===
    "eliminar"

  ) {

    eliminarCocina(id);

  }

}



async function editarCocina(id) {

  const item =
    data.cocina.find(

      producto =>
        producto.id === id

    );


  if (!item) {

    return;

  }



  const producto =
    prompt(

      "Producto",

      item.producto

    );


  if (
    producto === null
  ) {

    return;

  }



  const unidad =
    prompt(

      "Unidad",

      item.unidad

    );


  if (
    unidad === null
  ) {

    return;

  }



  const cantidad =
    prompt(

      "Cantidad",

      item.cantidad

    );


  if (
    cantidad === null
  ) {

    return;

  }



  const costo =
    prompt(

      "Costo total",

      item.costo_total

    );


  if (
    costo === null
  ) {

    return;

  }



  try {

    await api(

      `/cocina/${id}`,

      {

        method:
          "PUT",

        body:
          JSON.stringify({

            nombre_producto:
              producto.trim(),

            unidad:
              unidad.trim(),

            cantidad:
              numero(
                cantidad
              ),

            costo_total:
              numero(
                costo
              ),

            stock_minimo:
              item.stock_minimo

          })

      }

    );


    await cargarTodoDesdeBD();


  } catch (error) {

    console.error(error);

    alert(
      error.message
    );

  }

}



async function eliminarCocina(id) {

  if (

    !confirm(
      "¿Eliminar producto de cocina?"
    )

  ) {

    return;

  }


  try {

    await api(

      `/cocina/${id}`,

      {
        method:
          "DELETE"
      }

    );


    await cargarTodoDesdeBD();


  } catch (error) {

    console.error(error);

    alert(
      error.message
    );

  }

}



/* =====================================================
   PRODUCTOS Y RECETAS
===================================================== */


async function crearProductoVenta() {

  const nombre =
    $("nombreProductoVenta")
      .value
      .trim();


  const precio =
    numero(
      $("precioProductoVenta")
        .value
    );


  if (
    !nombre ||
    precio <= 0
  ) {

    alert(
      "Completa producto y precio"
    );


    return;

  }



  try {

    await api(

      "/productos",

      {

        method:
          "POST",

        body:
          JSON.stringify({

            nombre,

            precio,

            activo:
              true

          })

      }

    );


    $("nombreProductoVenta")
      .value = "";


    $("precioProductoVenta")
      .value = "";


    await cargarTodoDesdeBD();


  } catch (error) {

    console.error(error);

    alert(
      error.message
    );

  }

}



function obtenerCostoUnitarioCocina(
  item
) {

  if (!item) {

    return 0;

  }


  if (
    numero(
      item.costo_unitario
    ) > 0
  ) {

    return numero(
      item.costo_unitario
    );

  }


  if (
    numero(
      item.cantidad
    ) <= 0
  ) {

    return 0;

  }


  return redondear(

    numero(
      item.costo_total
    )

    /

    numero(
      item.cantidad
    )

  );

}



function crearOpcionesIngredientesCocina(
  valorSeleccionado = ""
) {

  let opciones = `

    <option value="">
      Seleccionar insumo de cocina
    </option>

  `;


  data.cocina.forEach(

    item => {

      const seleccionado =

        Number(
          valorSeleccionado
        ) ===
        item.id

          ? "selected"

          : "";


      opciones += `

        <option
          value="${item.id}"
          ${seleccionado}
        >

          ${item.producto} -

          ${item.cantidad}

          ${item.unidad}

        </option>

      `;

    }

  );


  return opciones;

}



function agregarFilaIngrediente() {

  const contenedor =
    $("ingredientesReceta");


  if (!contenedor) {

    return;

  }


  const fila =
    document.createElement(
      "div"
    );


  fila.className =
    "form-row receta-ingrediente";


  fila.innerHTML = `

    <select
      class="receta-insumo"
      title="Seleccionar producto de cocina"
    >

      ${crearOpcionesIngredientesCocina()}

    </select>


    <input
      class="receta-cantidad"
      type="number"
      min="0.01"
      step="0.01"
      placeholder="Cantidad usada"
      title="Cantidad usada en la receta"
    />


    <input
      class="receta-costo"
      type="text"
      value="$0"
      title="Costo del ingrediente"
      readonly
    />


    <button
      type="button"
      class="eliminar quitar-ingrediente"
    >
      Quitar
    </button>

  `;


  contenedor.appendChild(
    fila
  );


  actualizarBotonesQuitar();

  actualizarCostoConstructorReceta();

}



function asegurarPrimeraFilaReceta() {

  const contenedor =
    $("ingredientesReceta");


  if (

    contenedor &&

    contenedor.children.length === 0

  ) {

    agregarFilaIngrediente();

  }

}



function actualizarBotonesQuitar() {

  const filas =
    document.querySelectorAll(
      ".receta-ingrediente"
    );


  filas.forEach(

    fila => {

      const boton =
        fila.querySelector(
          ".quitar-ingrediente"
        );


      if (!boton) {

        return;

      }


      boton.style.display =

        filas.length === 1

          ? "none"

          : "block";

    }

  );

}



function accionesIngredientesReceta(
  evento
) {

  const boton =
    evento.target.closest(
      ".quitar-ingrediente"
    );


  if (!boton) {

    return;

  }


  const fila =
    boton.closest(
      ".receta-ingrediente"
    );


  if (!fila) {

    return;

  }


  fila.remove();


  asegurarPrimeraFilaReceta();

  actualizarBotonesQuitar();

  actualizarCostoConstructorReceta();

}



function actualizarCostoConstructorReceta() {

  const filas =
    document.querySelectorAll(
      ".receta-ingrediente"
    );


  let costoTotal = 0;


  filas.forEach(

    fila => {

      const cocinaId =
        Number(

          fila.querySelector(
            ".receta-insumo"
          )?.value

        );


      const cantidad =
        numero(

          fila.querySelector(
            ".receta-cantidad"
          )?.value

        );


      const itemCocina =
        data.cocina.find(

          item =>
            item.id ===
            cocinaId

        );


      const costoIngrediente =
        redondear(

          obtenerCostoUnitarioCocina(
            itemCocina
          )

          *

          cantidad

        );


      costoTotal +=
        costoIngrediente;


      const campoCosto =
        fila.querySelector(
          ".receta-costo"
        );


      if (campoCosto) {

        campoCosto.value =
          moneda(
            costoIngrediente
          );

      }

    }

  );


  if (
    $("costoTotalReceta")
  ) {

    $("costoTotalReceta")
      .value =
        moneda(

          redondear(
            costoTotal
          )

        );

  }

}



async function agregarReceta() {

  const productoId =
    Number(
      $("selectProductoVenta")
        .value
    );


  if (!productoId) {

    alert(
      "Selecciona el producto de venta"
    );


    return;

  }



  const filas = [

    ...document.querySelectorAll(
      ".receta-ingrediente"
    )

  ];



  const ingredientes =
    filas.map(

      fila => ({

        cocinaId:
          Number(

            fila.querySelector(
              ".receta-insumo"
            )?.value

          ),

        cantidad:
          numero(

            fila.querySelector(
              ".receta-cantidad"
            )?.value

          )

      })

    );



  const incompleto =
    ingredientes.some(

      item =>

        !item.cocinaId ||

        item.cantidad <= 0

    );



  if (

    ingredientes.length === 0 ||

    incompleto

  ) {

    alert(

      "Completa todos los ingredientes " +
      "y sus cantidades"

    );


    return;

  }



  const idsNuevos =
    ingredientes.map(

      item =>
        item.cocinaId

    );



  if (

    new Set(
      idsNuevos
    ).size !==
    idsNuevos.length

  ) {

    alert(

      "No repitas el mismo ingrediente " +
      "en la receta"

    );


    return;

  }



  const idsGuardados =
    new Set(

      data.recetas

        .filter(

          item =>

            item.producto_venta_id ===
            productoId

        )

        .map(

          item =>
            item.inventario_cocina_id

        )

    );



  const yaExiste =
    ingredientes.some(

      item =>

        idsGuardados.has(
          item.cocinaId
        )

    );



  if (yaExiste) {

    alert(

      "Uno de los ingredientes " +
      "ya está guardado en esta receta"

    );


    return;

  }



  try {

    for (
      const ingrediente of ingredientes
    ) {

      await api(

        "/recetas",

        {

          method:
            "POST",

          body:
            JSON.stringify({

              producto_venta_id:
                productoId,

              inventario_cocina_id:
                ingrediente.cocinaId,

              cantidad_necesaria:
                ingrediente.cantidad

            })

        }

      );

    }



    await cargarTodoDesdeBD();



    $("selectProductoVenta")
      .value = "";



    const contenedor =
      $("ingredientesReceta");


    if (contenedor) {

      contenedor.innerHTML = "";

    }



    asegurarPrimeraFilaReceta();

    actualizarCostoConstructorReceta();



    alert(
      "Receta guardada correctamente"
    );


  } catch (error) {

    console.error(error);

    alert(
      error.message
    );

  }

}



function calcularCostoPlato(
  productoId
) {

  return redondear(

    data.recetas

      .filter(

        item =>

          item.producto_venta_id ===
          productoId

      )

      .reduce(

        (
          total,
          receta
        ) => {


          const itemCocina =
            data.cocina.find(

              item =>

                item.id ===
                receta.inventario_cocina_id

            );


          const costoIngrediente =

            obtenerCostoUnitarioCocina(
              itemCocina
            )

            *

            numero(
              receta.cantidad_necesaria
            );


          return (

            total +

            costoIngrediente

          );

        },

        0

      )

  );

}



function accionesProductos(evento) {

  const boton =
    evento.target.closest(
      "button[data-action]"
    );


  if (!boton) {

    return;

  }


  const id =
    Number(
      boton.dataset.id
    );


  if (

    boton.dataset.action ===
    "editar"

  ) {

    editarProducto(id);

  }


  if (

    boton.dataset.action ===
    "eliminar"

  ) {

    eliminarProducto(id);

  }

}



async function editarProducto(id) {

  const item =
    data.productos.find(

      producto =>
        producto.id === id

    );


  if (!item) {

    return;

  }



  const nombre =
    prompt(

      "Producto",

      item.nombre

    );


  if (
    nombre === null
  ) {

    return;

  }



  const precio =
    prompt(

      "Precio",

      item.precio

    );


  if (
    precio === null
  ) {

    return;

  }


  try {

    await api(

      `/productos/${id}`,

      {

        method:
          "PUT",

        body:
          JSON.stringify({

            nombre:
              nombre.trim(),

            precio:
              numero(
                precio
              ),

            activo:
              item.activo

          })

      }

    );


    await cargarTodoDesdeBD();


  } catch (error) {

    console.error(error);

    alert(
      error.message
    );

  }

}



async function eliminarProducto(id) {

  if (

    !confirm(
      "¿Eliminar producto?"
    )

  ) {

    return;

  }


  try {

    await api(

      `/productos/${id}`,

      {

        method:
          "DELETE"

      }

    );


    await cargarTodoDesdeBD();


  } catch (error) {

    console.error(error);

    alert(
      error.message
    );

  }

}



/* =====================================================
   VENTAS
===================================================== */


async function registrarVenta() {

  const productoId =
    Number(
      $("selectVentaProducto")
        .value
    );


  const cantidad =
    numero(
      $("cantidadVenta")
        .value
    );


  const medioPago =
    $("medioPagoVenta")
      .value;


  if (

    !productoId ||

    cantidad <= 0

  ) {

    alert(
      "Selecciona producto y cantidad"
    );


    return;

  }



  try {

    await api(

      "/ventas",

      {

        method:
          "POST",

        body:
          JSON.stringify({

            medio_pago:
              medioPago,

            items: [

              {

                producto_venta_id:
                  productoId,

                cantidad

              }

            ]

          })

      }

    );



    $("cantidadVenta")
      .value = "";


    await cargarTodoDesdeBD();


    alert(
      "Venta registrada correctamente"
    );


  } catch (error) {

    console.error(error);

    alert(
      error.message
    );

  }

}



/* =====================================================
   RENDER
===================================================== */


function renderizarTodo() {

  renderResumen();

  renderBodega();

  renderProveedoresVisual();

  renderCocina();

  renderProductos();

  renderVentas();

  renderSelects();

}



function renderResumen() {

  $("totalBodega")
    .textContent =
      data.bodega.length;


  $("totalCocina")
    .textContent =
      data.cocina.length;


  $("totalProductos")
    .textContent =
      data.productos.length;


  $("totalVentas")
    .textContent =
      moneda(
        data.totalVentas
      );

}



function renderBodega() {

  const tbody =
    $("tablaBodega");


  if (!tbody) {

    return;

  }


  tbody.innerHTML = "";


  data.bodega.forEach(

    item => {

      tbody.innerHTML += `

        <tr>

          <td>

            ${item.id}

          </td>


          <td>

            ${item.producto}

          </td>


          <td>

            ${item.unidad}

          </td>


          <td>

            ${item.cantidad}

          </td>


          <td>

            ${moneda(
              item.costo_total
            )}

          </td>


          <td>

            <button
              type="button"
              data-action="editar"
              data-id="${item.id}"
            >
              Editar
            </button>


            <button
              type="button"
              class="eliminar"
              data-action="eliminar"
              data-id="${item.id}"
            >
              Eliminar
            </button>

          </td>

        </tr>

      `;

    }

  );

}



function renderCocina() {

  const tbody =
    $("tablaCocina");


  if (!tbody) {

    return;

  }


  tbody.innerHTML = "";


  data.cocina.forEach(

    item => {

      tbody.innerHTML += `

        <tr>

          <td>

            ${item.id}

          </td>


          <td>

            ${item.producto}

          </td>


          <td>

            ${item.unidad}

          </td>


          <td>

            ${item.cantidad}

          </td>


          <td>

            ${moneda(
              item.costo_unitario
            )}

          </td>


          <td>

            ${moneda(
              item.costo_total
            )}

          </td>


          <td>

            <button
              type="button"
              data-action="editar"
              data-id="${item.id}"
            >
              Editar
            </button>


            <button
              type="button"
              class="eliminar"
              data-action="eliminar"
              data-id="${item.id}"
            >
              Eliminar
            </button>

          </td>

        </tr>

      `;

    }

  );

}



function renderProductos() {

  const tbody =
    $("tablaProductos");


  if (!tbody) {

    return;

  }


  tbody.innerHTML = "";


  data.productos.forEach(

    producto => {


      const ingredientesReceta =
        data.recetas.filter(

          item =>

            item.producto_venta_id ===
            producto.id

        );



      const receta =
        ingredientesReceta

          .map(

            item => {


              const itemCocina =
                data.cocina.find(

                  cocina =>

                    cocina.id ===
                    item.inventario_cocina_id

                );


              const costoIngrediente =
                redondear(

                  obtenerCostoUnitarioCocina(
                    itemCocina
                  )

                  *

                  numero(
                    item.cantidad_necesaria
                  )

                );


              const cantidadPorciones =
                numero(
                  item.cantidad_necesaria
                );


              const palabraPorcion =

                cantidadPorciones === 1

                  ? "porción"

                  : "porciones";


              const nombreIngrediente =

                itemCocina?.producto ||

                item.ingrediente ||

                "Ingrediente";


              const unidadIngrediente =

                itemCocina?.unidad ||

                item.unidad ||

                "";


              return `

                <div>

                  ${cantidadPorciones}

                  ${palabraPorcion}

                  de ${nombreIngrediente}

                  ${
                    unidadIngrediente

                      ? `(${unidadIngrediente})`

                      : ""
                  }

                  — Costo:

                  ${moneda(
                    costoIngrediente
                  )}

                </div>

              `;

            }

          )

          .join("");



      const costoPlato =
        calcularCostoPlato(
          producto.id
        );



      tbody.innerHTML += `

        <tr>


          <td>

            ${producto.id}

          </td>


          <td>

            ${producto.nombre}

          </td>


          <td>

            ${moneda(
              producto.precio
            )}

          </td>


          <td>

            ${receta || "Sin receta"}

          </td>


          <td>

            <strong>

              Costo total:

              ${moneda(
                costoPlato
              )}

            </strong>

          </td>


          <td>

            <button
              type="button"
              data-action="editar"
              data-id="${producto.id}"
            >
              Editar
            </button>


            <button
              type="button"
              class="eliminar"
              data-action="eliminar"
              data-id="${producto.id}"
            >
              Eliminar
            </button>

          </td>


        </tr>

      `;

    }

  );

}



function renderVentas() {

  const tbody =
    $("tablaVentas");


  if (!tbody) {

    return;

  }


  tbody.innerHTML = "";


  data.ventas.forEach(

    venta => {

      tbody.innerHTML += `

        <tr>


          <td>

            ${venta.id}

          </td>


          <td>

            ${venta.producto}

          </td>


          <td>

            ${venta.cantidad}

          </td>


          <td>

            ${nombreMedioPago(
              venta.medio_pago
            )}

          </td>


          <td>

            ${moneda(
              venta.total
            )}

          </td>


          <td>

            ${formatearFecha(
              venta.fecha
            )}

          </td>


        </tr>

      `;

    }

  );

}



/* =====================================================
   SELECTS
===================================================== */


function renderSelects() {

  const selectBodega =
    $("selectBodegaCocina");


  const selectProductoVenta =
    $("selectProductoVenta");


  const selectVentaProducto =
    $("selectVentaProducto");



  if (selectBodega) {

    const valor =
      selectBodega.value;


    selectBodega.innerHTML = `

      <option value="">

        Seleccionar producto de bodega

      </option>

    `;


    data.bodega

      .filter(

        item =>

          item.cantidad > 0 &&

          item.costo_total > 0

      )

      .forEach(

        item => {

          selectBodega.innerHTML += `

            <option value="${item.id}">

              ${item.producto} -

              ${item.cantidad}

              ${item.unidad}

            </option>

          `;

        }

      );


    selectBodega.value =
      valor;

  }



  if (selectProductoVenta) {

    const valor =
      selectProductoVenta.value;


    selectProductoVenta.innerHTML = `

      <option value="">

        Seleccionar producto

      </option>

    `;


    data.productos

      .filter(

        item =>
          item.activo

      )

      .forEach(

        item => {

          selectProductoVenta.innerHTML += `

            <option value="${item.id}">

              ${item.nombre}

            </option>

          `;

        }

      );


    selectProductoVenta.value =
      valor;

  }



  if (selectVentaProducto) {

    const valor =
      selectVentaProducto.value;


    selectVentaProducto.innerHTML = `

      <option value="">

        Seleccionar producto

      </option>

    `;


    data.productos

      .filter(

        item =>
          item.activo

      )

      .forEach(

        item => {

          selectVentaProducto.innerHTML += `

            <option value="${item.id}">

              ${item.nombre} -

              ${moneda(
                item.precio
              )}

            </option>

          `;

        }

      );


    selectVentaProducto.value =
      valor;

  }



  document

    .querySelectorAll(
      ".receta-insumo"
    )

    .forEach(

      selector => {

        const valor =
          selector.value;


        selector.innerHTML =
          crearOpcionesIngredientesCocina(
            valor
          );


        selector.value =
          valor;

      }

    );



  renderSelectProductoMaestroProveedor();


  actualizarCostoConstructorReceta();

}