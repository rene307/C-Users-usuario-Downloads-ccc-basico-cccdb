//const API_BASE = "http://localhost:3000/api";
const API_BASE = "/api";

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
  totalVentas: 0,
  totalVentasSemana: 0,
  totalVentasMes: 0,
  totalVentasAnio: 0,
  costoVentasDia: 0,
  costoVentasMes: 0,
  costoDiarioPromedio: 0,
  resultadoBrutoMes: 0,
  cantidadVentasDia: 0,
  cantidadVentasSemana: 0,
  cantidadVentasMes: 0,
  cantidadVentasAnio: 0,
  diasTranscurridosMes: 1,
  rankingVentas: []
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



/* =====================================================
   FECHA Y HORA
===================================================== */

function formatearFecha(valor) {

  if (!valor) {
    return "";
  }


  /*
    PostgreSQL/Supabase puede devolver la fecha
    sin indicar explícitamente la zona horaria.

    Si no viene Z ni offset, la tratamos como UTC.
  */
  let fechaServidor =
    String(valor).trim();


  const tieneZonaHoraria =
    /Z$|[+-]\d{2}:\d{2}$/.test(
      fechaServidor
    );


  if (!tieneZonaHoraria) {

    fechaServidor += "Z";

  }


  const fecha =
    new Date(
      fechaServidor
    );


  const fechaTexto =
    fecha.toLocaleDateString(
      "es-CL",
      {
        timeZone:
          "America/Santiago",

        day:
          "2-digit",

        month:
          "2-digit",

        year:
          "numeric"
      }
    );


  const horaTexto =
    fecha.toLocaleTimeString(
      "es-CL",
      {
        timeZone:
          "America/Santiago",

        hour:
          "2-digit",

        minute:
          "2-digit",

        hour12:
          false
      }
    );


  return `

    <div
      style="
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 95px;
        line-height: 1.15;
      "
    >

      <span
        style="
          white-space: nowrap;
          font-weight: 600;
        "
      >
        ${fechaTexto}
      </span>

      <span
        style="
          white-space: nowrap;
          font-size: 12px;
          opacity: 0.70;
        "
      >
        ${horaTexto}
      </span>

    </div>

  `;

}


// =========================================================
// FECHA VISIBLE EN LOS INDICADORES DEL DÍA
// Muestra la fecha actual de Santiago en Ventas del día
// y Unidades del día.
// =========================================================
function actualizarFechaResumenDia() {

  const fechaTexto =
    new Date()
      .toLocaleDateString(
        "es-CL",
        {
          timeZone: "America/Santiago",
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        }
      )
      .replace(/\//g, "-");


  const totalVentasDia =
    $("totalVentas");


  const tituloVentasDia =
    totalVentasDia
      ?.closest(".resumen-card")
      ?.querySelector("h3");


  if (tituloVentasDia) {

    tituloVentasDia.textContent =
      `Ventas del día ${fechaTexto}`;

  }


  const totalUnidadesDia =
    $("cantidadVentasDia");


  const tituloUnidadesDia =
    totalUnidadesDia
      ?.closest(".resumen-card")
      ?.querySelector("h3");


  if (tituloUnidadesDia) {

    tituloUnidadesDia.textContent =
      `Unidades del día ${fechaTexto}`;

  }

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

      resultado.detalle ||

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


  data.totalVentasSemana =
    numero(
      ventasHoy.total_semana
    );


  data.totalVentasMes =
    numero(
      ventasHoy.total_mes
    );


  data.totalVentasAnio =
    numero(
      ventasHoy.total_anio
    );


  data.costoVentasDia =
    numero(
      ventasHoy.costo_dia
    );


  data.costoVentasMes =
    numero(
      ventasHoy.costo_mes
    );


  data.costoDiarioPromedio =
    numero(
      ventasHoy.costo_diario_promedio
    );


  data.resultadoBrutoMes =
    numero(
      ventasHoy.resultado_bruto_mes
    );


  data.cantidadVentasDia =
    numero(
      ventasHoy.cantidad_dia
    );


  data.cantidadVentasSemana =
    numero(
      ventasHoy.cantidad_semana
    );


  data.cantidadVentasMes =
    numero(
      ventasHoy.cantidad_mes
    );


  data.cantidadVentasAnio =
    numero(
      ventasHoy.cantidad_anio
    );


  data.diasTranscurridosMes =
    Math.max(
      numero(
        ventasHoy.dias_transcurridos_mes
      ),
      1
    );


  data.rankingVentas =
    Array.isArray(
      ventasHoy.ranking_mes
    )
      ? ventasHoy.ranking_mes.map(
          item => ({

            producto_id:
              Number(
                item.producto_id
              ),

            producto:
              item.producto || "",

            cantidad:
              numero(
                item.cantidad
              ),

            total_venta:
              numero(
                item.total_venta
              ),

            costo:
              numero(
                item.costo
              ),

            resultado_bruto:
              numero(
                item.resultado_bruto
              )

          })
        )
      : [];


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



// =========================================================
// ⚠️ OJO - ACCESO LIMITADO POR ROL CCC-BÁSICO
// SOLO PARA LA PRESENTACIÓN.
//
// Este bloque restringe visualmente al usuario temporal:
//   chef@ccc.local
//
// SOLO puede entrar a:
// - Bodega
// - Cocina
// - Productos / Recetas
//
// CUANDO TERMINE LA PRESENTACIÓN:
// BORRAR desde "OJO - ACCESO LIMITADO POR ROL" hasta "FIN ACCESO LIMITADO POR ROL"
// y quitar las llamadas a estas funciones marcadas abajo.
// =========================================================

function esAccesoLimitado() {

  // =======================================================
  // ⚠️ OJO - ACCESO LIMITADO POR ROL
  // TEMPORAL PARA LA PRESENTACIÓN DE CCC-BÁSICO
  //
  // YA NO SE LIMITA POR CORREO.
  // SE LIMITA POR EL ROL ASIGNADO AL USUARIO.
  //
  // Actualmente el rol limitado usa:
  // rol = chef
  // rol_id = 3
  //
  // También acepta "acceso_limitado" por si luego
  // quieres dejar ese nombre directamente en public.roles.
  // =======================================================

  const rol = String(
    usuario?.rol || ""
  )
    .trim()
    .toLowerCase();

  const rolId = Number(
    usuario?.rol_id || 0
  );

  return (
    rol === "chef" ||
    rol === "acceso_limitado" ||
    rol === "acceso limitado" ||
    rolId === 3
  );

}


function aplicarMenuAccesoLimitado() {

  const limitado =
    esAccesoLimitado();


  const botonesSoloAdministrador = [
    "btnResumen",
    "btnProveedores",
    "btnVentas"
  ];


  botonesSoloAdministrador.forEach(
    id => {

      const boton =
        $(id);


      if (boton) {

        boton.style.display =
          limitado
            ? "none"
            : "";

      }

    }
  );


  // El botón/indicador de Rol mostrará "Acceso limitado".
  if ($("rolUsuario")) {

    $("rolUsuario")
      .textContent =
        limitado
          ? "Acceso limitado"
          : (usuario?.rol || "Administrador");

  }


  // Si el rol es limitado, la primera vista será Bodega.
  if (limitado) {

    mostrarVista(
      "vistaBodega"
    );


    activarBoton(
      "btnBodega"
    );

  }

}

// =========================================================
// ⚠️ FIN ACCESO LIMITADO POR ROL
// =========================================================


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
        "";

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


  // =======================================================
  // ⚠️ OJO - ACCESO LIMITADO POR ROL
  // Oculta Resumen, Proveedores y Ventas del día.
  // =======================================================
  aplicarMenuAccesoLimitado();

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

    totalVentas: 0,

    totalVentasSemana: 0,

    totalVentasMes: 0,

    totalVentasAnio: 0,

    costoVentasDia: 0,

    costoVentasMes: 0,

    costoDiarioPromedio: 0,

    resultadoBrutoMes: 0,

    cantidadVentasDia: 0,

    cantidadVentasSemana: 0,

    cantidadVentasMes: 0,

    cantidadVentasAnio: 0,

    diasTranscurridosMes: 1,

    rankingVentas: []

  };


  proveedoresVisual = [];

  aliasesProveedorVisual = [];


  mostrarLogin();

}



/* =====================================================
   NAVEGACIÓN
===================================================== */


function iniciarNavegacion() {

  const botonMenuMovil =
    $("btnMenuMovil");

  const sidebar =
    document.querySelector(".sidebar");


  botonMenuMovil
    ?.addEventListener(
      "click",
      () => {

        const abierto =
          sidebar
            ?.classList
            .toggle("menu-abierto") || false;

        botonMenuMovil
          .setAttribute(
            "aria-expanded",
            String(abierto)
          );

      }
    );


  const cerrarMenuMovil = () => {

    if (
      window.innerWidth <= 800
    ) {

      sidebar
        ?.classList
        .remove("menu-abierto");

      botonMenuMovil
        ?.setAttribute(
          "aria-expanded",
          "false"
        );

    }

  };


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


              cerrarMenuMovil();


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

      () => {

        cerrarMenuMovil();

        cerrarSesion();

      }

    );

}



function mostrarVista(idVista) {

  // =======================================================
  // ⚠️ OJO - ACCESO LIMITADO POR ROL
  // Aunque otro código intente abrir Resumen, Proveedores
  // o Ventas, el rol limitado vuelve a Bodega.
  // =======================================================

  if (esAccesoLimitado()) {

    const vistasPermitidasAccesoLimitado = [
      "vistaBodega",
      "vistaCocina",
      "vistaProductos"
    ];


    if (
      !vistasPermitidasAccesoLimitado.includes(
        idVista
      )
    ) {

      idVista =
        "vistaBodega";

    }

  }


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

  // =======================================================
  // ⚠️ OJO - ACCESO LIMITADO POR ROL
  // Mantiene activo solamente un botón permitido.
  // =======================================================

  if (esAccesoLimitado()) {

    const botonesPermitidosAccesoLimitado = [
      "btnBodega",
      "btnCocina",
      "btnProductos"
    ];


    if (
      !botonesPermitidosAccesoLimitado.includes(
        idBoton
      )
    ) {

      idBoton =
        "btnBodega";

    }

  }


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



  $("selectProductoVenta")
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

        actualizarComparacionPrecioProveedor();

      }

    );


  $("proveedorPrecio")
    ?.addEventListener(

      "input",

      actualizarComparacionPrecioProveedor

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

  actualizarComparacionPrecioProveedor();

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



function obtenerCostoActualBodegaProveedor(productoMaestroId) {

  const item =
    data.bodega.find(
      producto =>
        Number(producto.id) ===
        Number(productoMaestroId)
    );

  if (!item) {
    return 0;
  }

  const cantidad =
    numero(item.cantidad);

  const costoTotal =
    numero(item.costo_total);

  if (cantidad <= 0) {
    return 0;
  }

  return redondear(
    costoTotal / cantidad
  );

}


function obtenerMejorProveedorRegistrado(
  productoMaestroId,
  ignorarId = null
) {

  const candidatos =
    proveedoresVisual
      .filter(
        item =>
          Number(item.productoMaestroId) ===
            Number(productoMaestroId) &&
          numero(item.precio) > 0 &&
          (
            ignorarId === null ||
            Number(item.id) !== Number(ignorarId)
          )
      )
      .sort(
        (a, b) =>
          numero(a.precio) -
          numero(b.precio)
      );

  return candidatos[0] || null;

}


function calcularComparacionPrecioProveedor(
  productoMaestroId,
  precio,
  ignorarId = null
) {

  const precioNuevo =
    numero(precio);

  const costoActual =
    obtenerCostoActualBodegaProveedor(
      productoMaestroId
    );

  const mejorProveedor =
    obtenerMejorProveedorRegistrado(
      productoMaestroId,
      ignorarId
    );

  let referencia =
    costoActual;

  let referenciaTexto =
    "costo actual de bodega";

  if (
    referencia <= 0 &&
    mejorProveedor
  ) {
    referencia =
      numero(mejorProveedor.precio);

    referenciaTexto =
      `precio registrado de ${mejorProveedor.proveedor}`;
  }

  if (
    precioNuevo <= 0 ||
    referencia <= 0
  ) {
    return {
      estado: "neutral",
      porcentaje: 0,
      referencia,
      referenciaTexto,
      mejorProveedor,
      texto:
        "Sin referencia suficiente para comparar este precio."
    };
  }

  const variacion =
    redondear(
      (
        (precioNuevo - referencia) /
        referencia
      ) * 100
    );

  if (variacion < 0) {
    return {
      estado: "barato",
      porcentaje: variacion,
      referencia,
      referenciaTexto,
      mejorProveedor,
      texto:
        `↓ ${Math.abs(variacion).toFixed(1)}% más barato`
    };
  }

  if (variacion > 0) {
    return {
      estado: "caro",
      porcentaje: variacion,
      referencia,
      referenciaTexto,
      mejorProveedor,
      texto:
        `↑ ${Math.abs(variacion).toFixed(1)}% más caro`
    };
  }

  return {
    estado: "neutral",
    porcentaje: 0,
    referencia,
    referenciaTexto,
    mejorProveedor,
    texto: "Mismo precio que la referencia"
  };

}


function actualizarComparacionPrecioProveedor() {

  const caja =
    $("proveedorComparacionPrecio");

  if (!caja) {
    return;
  }

  const productoMaestro =
    obtenerProductoMaestroProveedor();

  const precio =
    numero(
      $("proveedorPrecio")?.value
    );

  if (!productoMaestro || precio <= 0) {
    caja.className =
      "ccc-comparacion-precio neutral";

    caja.textContent =
      "Ingresa un precio para comparar con el costo actual y otros proveedores.";

    return;
  }

  const comparacion =
    calcularComparacionPrecioProveedor(
      productoMaestro.id,
      precio,
      proveedorEditandoId
    );

  caja.className =
    `ccc-comparacion-precio ${comparacion.estado}`;

  let detalleMejor = "";

  if (
    comparacion.mejorProveedor &&
    numero(comparacion.mejorProveedor.precio) < precio
  ) {
    const diferenciaMejor =
      redondear(
        (
          (precio - numero(comparacion.mejorProveedor.precio)) /
          precio
        ) * 100
      );

    detalleMejor =
      ` · Mejor registrado: ${comparacion.mejorProveedor.proveedor} ` +
      `${moneda(comparacion.mejorProveedor.precio)} ` +
      `(↓ ${diferenciaMejor.toFixed(1)}%)`;
  }

  caja.innerHTML =
    `<strong>${comparacion.texto}</strong>` +
    ` · Referencia: ${moneda(comparacion.referencia)} ` +
    `(${escaparHTML(comparacion.referenciaTexto)})` +
    detalleMejor;

}


function comparacionPrecioProveedorTabla(item) {

  const comparacion =
    calcularComparacionPrecioProveedor(
      item.productoMaestroId,
      item.precio,
      item.id
    );

  if (comparacion.estado === "barato") {
    return `
      <span class="ccc-precio-indicador barato">
        ↓ ${Math.abs(comparacion.porcentaje).toFixed(1)}%
      </span>
    `;
  }

  if (comparacion.estado === "caro") {
    return `
      <span class="ccc-precio-indicador caro">
        ↑ ${Math.abs(comparacion.porcentaje).toFixed(1)}%
      </span>
    `;
  }

  return `
    <span class="ccc-precio-indicador neutral">
      — 0.0%
    </span>
  `;

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

  actualizarComparacionPrecioProveedor();

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

  actualizarComparacionPrecioProveedor();


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

  const contenedor =
    $("tablaProveedoresVisual");


  if (!contenedor) {

    return;

  }


  if (
    proveedoresVisual.length === 0
  ) {

    contenedor.innerHTML = `

      <div class="proveedores-tabla-vacia">

        Sin proveedores agregados
        en esta vista.

      </div>

    `;


    return;

  }


  /*
    Agrupa todos los proveedores por producto maestro CCC.
    Así Filete queda junto con Filete, Lechuga con Lechuga, etc.
  */
  const grupos =
    proveedoresVisual.reduce(

      (acumulador, item) => {

        const clave =
          String(
            item.productoMaestro ||
            "Sin producto"
          ).trim();

        if (!acumulador[clave]) {
          acumulador[clave] = [];
        }

        acumulador[clave].push(item);

        return acumulador;

      },

      {}

    );


  contenedor.innerHTML =
    Object.entries(grupos)

      .sort(
        ([productoA], [productoB]) =>
          productoA.localeCompare(
            productoB,
            "es",
            { sensitivity: "base" }
          )
      )

      .map(

        ([producto, items]) => {

          const filas =
            [...items]

              .sort(
                (a, b) =>
                  numero(a.precio) -
                  numero(b.precio)
              )

              .map(

                item => `

                  <tr>

                    <td>

                      <strong>
                        ${escaparHTML(item.proveedor)}
                      </strong>

                      ${
                        item.rut
                          ? `<div class="proveedores-dato-secundario">${escaparHTML(item.rut)}</div>`
                          : ""
                      }

                    </td>

                    <td>
                      ${escaparHTML(item.nombreBoleta)}
                    </td>

                    <td>
                      ${
                        item.aliases.length
                          ? item.aliases.map(escaparHTML).join(", ")
                          : "—"
                      }
                    </td>

                    <td>
                      ${escaparHTML(item.unidad)}
                    </td>

                    <td class="proveedores-precio">
                      ${moneda(item.precio)}
                    </td>

                    <td>
                      ${comparacionPrecioProveedorTabla(item)}
                    </td>

                    <td>
                      ${escaparHTML(item.estado)}
                    </td>

                    <td class="proveedores-acciones">

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


          return `

            <section class="proveedores-grupo">

              <h3 class="proveedores-grupo-titulo">
                ${escaparHTML(producto)}
              </h3>

              <div class="proveedores-grupo-box table-wrap">

                <table class="proveedores-tabla-grupo">

                  <thead>
                    <tr>
                      <th>PROVEEDOR</th>
                      <th>NOMBRE BOLETA</th>
                      <th>ALIAS</th>
                      <th>UNIDAD</th>
                      <th>ÚLTIMO PRECIO</th>
                      <th>COMPARACIÓN</th>
                      <th>ESTADO</th>
                      <th>ACCIÓN</th>
                    </tr>
                  </thead>

                  <tbody>
                    ${filas}
                  </tbody>

                </table>

              </div>

            </section>

          `;

        }

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


const CLAVE_GANANCIAS_PRODUCTOS =
  "ccc_porcentajes_ganancia";


function cargarPorcentajesGanancia() {

  try {

    return JSON.parse(
      localStorage.getItem(
        CLAVE_GANANCIAS_PRODUCTOS
      ) || "{}"
    );

  } catch (error) {

    console.warn(
      "No se pudieron leer los porcentajes de ganancia guardados",
      error
    );

    return {};

  }

}


function guardarPorcentajeGanancia(
  productoId,
  porcentaje
) {

  if (
    !productoId ||
    porcentaje <= 0 ||
    porcentaje >= 100
  ) {
    return;
  }

  const porcentajes =
    cargarPorcentajesGanancia();

  porcentajes[String(productoId)] =
    redondear(porcentaje);

  localStorage.setItem(
    CLAVE_GANANCIAS_PRODUCTOS,
    JSON.stringify(porcentajes)
  );

}


function obtenerPorcentajeGananciaProducto(
  productoId
) {

  const porcentajes =
    cargarPorcentajesGanancia();

  const guardado =
    numero(
      porcentajes[String(productoId)]
    );

  if (
    guardado > 0 &&
    guardado < 100
  ) {
    return guardado;
  }

  /*
    Si el producto ya tiene receta y precio, el porcentaje
    se puede reconstruir desde los datos guardados en BD:

    margen = (precio - costo) / precio * 100
  */
  const producto =
    data.productos.find(
      item => item.id === Number(productoId)
    );

  const costo =
    calcularCostoPlato(
      Number(productoId)
    );

  const precio =
    numero(producto?.precio);

  if (
    costo > 0 &&
    precio > costo
  ) {

    const porcentaje =
      redondear(
        (
          (precio - costo) /
          precio
        ) * 100
      );

    guardarPorcentajeGanancia(
      productoId,
      porcentaje
    );

    return porcentaje;

  }

  return 0;

}


function calcularPrecioPorGanancia(
  costo,
  porcentaje
) {

  const costoNumero =
    numero(costo);

  const porcentajeNumero =
    numero(porcentaje);

  if (
    costoNumero <= 0 ||
    porcentajeNumero <= 0 ||
    porcentajeNumero >= 100
  ) {
    return 0;
  }

  /*
    El porcentaje corresponde al margen sobre el precio
    de venta. Ejemplo: costo $972 y margen 35,2% =>
    precio aproximado $1.500.
  */
  return Math.round(
    costoNumero /
    (1 - porcentajeNumero / 100)
  );

}


async function crearProductoVenta() {

  const nombre =
    $("nombreProductoVenta")
      .value
      .trim();


  const porcentajeGanancia =
    numero(
      $("precioProductoVenta")
        .value
    );


  if (!nombre) {

    alert(
      "Ingresa el nombre del producto"
    );

    return;

  }


  if (
    porcentajeGanancia <= 0 ||
    porcentajeGanancia >= 100
  ) {

    alert(
      "Ingresa un porcentaje de ganancia mayor que 0 y menor que 100"
    );

    return;

  }


  try {

    const resultado =
      await api(

        "/productos",

        {

          method:
            "POST",

          body:
            JSON.stringify({

              nombre,

              /*
                El precio definitivo se calcula al guardar
                la receta, cuando ya conocemos su costo.
              */
              precio: 0,

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


    let productoId =
      Number(
        resultado?.id ||
        resultado?.producto?.id
      );


    if (!productoId) {

      const candidatos =
        data.productos
          .filter(
            item =>
              item.nombre
                .trim()
                .toLowerCase() ===
              nombre
                .trim()
                .toLowerCase()
          )
          .sort(
            (a, b) => b.id - a.id
          );

      productoId =
        candidatos[0]?.id || 0;

    }


    if (productoId) {

      guardarPorcentajeGanancia(
        productoId,
        porcentajeGanancia
      );

      /*
        Refresca los selectores y deja seleccionado automáticamente
        el producto recién creado para comenzar su receta de inmediato.
      */
      renderSelects();

      if ($("selectProductoVenta")) {
        $("selectProductoVenta").value = String(productoId);
      }

      actualizarCostoConstructorReceta();

    }


    alert(
      "Producto creado. Ya aparece en Crear receta y quedó seleccionado para que agregues sus ingredientes."
    );


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



function obtenerIconoProducto(nombre = "") {

  const texto =
    String(nombre)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const iconos = [
    [["leche"], "🥛"],
    [["lechuga"], "🥬"],
    [["tomate"], "🍅"],
    [["cebolla"], "🧅"],
    [["palta", "aguacate"], "🥑"],
    [["vienesa", "salchicha", "hot dog"], "🌭"],
    [["pan"], "🥖"],
    [["huevo"], "🥚"],
    [["queso"], "🧀"],
    [["pollo"], "🍗"],
    [["carne", "filete", "vacuno", "lomo"], "🥩"],
    [["cerdo", "chuleta"], "🥩"],
    [["pescado", "salmon", "atun"], "🐟"],
    [["arroz"], "🍚"],
    [["papa", "papas"], "🥔"],
    [["zanahoria"], "🥕"],
    [["ajo"], "🧄"],
    [["limon"], "🍋"],
    [["manzana"], "🍎"],
    [["platano", "banana"], "🍌"],
    [["naranja"], "🍊"],
    [["frutilla", "fresa"], "🍓"],
    [["harina"], "🌾"],
    [["azucar"], "🍚"],
    [["sal"], "🧂"],
    [["aceite"], "🫗"],
    [["mayonesa"], "🥄"],
    [["ketchup", "catsup"], "🍅"],
    [["mostaza"], "🟡"],
    [["jamon"], "🥓"],
    [["tocino", "bacon"], "🥓"],
    [["fideo", "fideos", "pasta"], "🍝"]
  ];

  for (const [palabras, icono] of iconos) {

    if (
      palabras.some(
        palabra => texto.includes(palabra)
      )
    ) {
      return icono;
    }
  }

  return "🧺";
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

          ${obtenerIconoProducto(item.producto)}
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

    const productoId =
      Number(
        $("selectProductoVenta")
          ?.value
      );

    const porcentajeGanancia =
      obtenerPorcentajeGananciaProducto(
        productoId
      );

    const precioVenta =
      calcularPrecioPorGanancia(
        redondear(costoTotal),
        porcentajeGanancia
      );

    $("costoTotalReceta")
      .value =
        moneda(precioVenta);

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


  const porcentajeGanancia =
    obtenerPorcentajeGananciaProducto(
      productoId
    );


  if (
    porcentajeGanancia <= 0 ||
    porcentajeGanancia >= 100
  ) {

    alert(
      "Este producto no tiene un porcentaje de ganancia válido. Edítalo y define un porcentaje entre 0 y 100."
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


    const producto =
      data.productos.find(
        item => item.id === productoId
      );


    const costoPlato =
      calcularCostoPlato(
        productoId
      );


    const precioVenta =
      calcularPrecioPorGanancia(
        costoPlato,
        porcentajeGanancia
      );


    if (
      producto &&
      precioVenta > 0
    ) {

      await api(
        `/productos/${productoId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            nombre: producto.nombre,
            precio: precioVenta,
            activo: producto.activo
          })
        }
      );

      await cargarTodoDesdeBD();

    }


    guardarPorcentajeGanancia(
      productoId,
      porcentajeGanancia
    );


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


  const porcentajeActual =
    obtenerPorcentajeGananciaProducto(id);


  const porcentajeTexto =
    prompt(

      "Porcentaje de ganancia deseado (ej: 35)",

      porcentajeActual > 0
        ? porcentajeActual
        : "35"

    );


  if (
    porcentajeTexto === null
  ) {
    return;
  }


  const porcentajeGanancia =
    numero(porcentajeTexto);


  if (
    porcentajeGanancia <= 0 ||
    porcentajeGanancia >= 100
  ) {

    alert(
      "El porcentaje debe ser mayor que 0 y menor que 100"
    );

    return;

  }


  const costoPlato =
    calcularCostoPlato(id);


  const precioCalculado =
    calcularPrecioPorGanancia(
      costoPlato,
      porcentajeGanancia
    );


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
              precioCalculado > 0
                ? precioCalculado
                : numero(item.precio),

            activo:
              item.activo

          })

      }

    );


    guardarPorcentajeGanancia(
      id,
      porcentajeGanancia
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



function porcentaje(valor) {

  return `${redondear(valor).toLocaleString(
    "es-CL",
    {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }
  )}%`;

}


function normalizarNombreGestion(valor) {

  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

}


function obtenerNumeroUnidad(valor) {

  const resultado =
    String(valor || "")
      .replace(",", ".")
      .match(/[0-9]+(?:\.[0-9]+)?/);

  return resultado
    ? Number(resultado[0])
    : 0;

}


function stockBodegaEnGramos(item) {

  if (!item) {
    return null;
  }


  const unidad =
    normalizarNombreGestion(
      item.unidad
    );


  const cantidad =
    numero(
      item.cantidad
    );


  if (
    unidad === "kg" ||
    unidad === "kilo" ||
    unidad === "kilos" ||
    unidad.includes("kilogram")
  ) {

    return cantidad * 1000;

  }


  if (
    unidad === "g" ||
    unidad === "gr" ||
    unidad === "gramo" ||
    unidad === "gramos"
  ) {

    return cantidad;

  }


  return null;

}


function obtenerStockBodegaEquivalente(
  itemCocina
) {

  const itemBodega =
    data.bodega.find(
      item =>
        normalizarNombreGestion(
          item.producto
        ) ===
        normalizarNombreGestion(
          itemCocina.producto
        )
    );


  if (!itemBodega) {

    return {
      porciones: 0,
      convertible: true
    };

  }


  const gramosBodega =
    stockBodegaEnGramos(
      itemBodega
    );


  const gramosPorPorcion =
    obtenerNumeroUnidad(
      itemCocina.unidad
    );


  if (
    gramosBodega === null ||
    gramosPorPorcion <= 0
  ) {

    return {
      porciones: 0,
      convertible: false
    };

  }


  return {
    porciones:
      gramosBodega /
      gramosPorPorcion,
    convertible: true
  };

}


function formatearCompraSugerida(
  itemCocina,
  porciones
) {

  const cantidadPorciones =
    Math.max(
      0,
      numero(porciones)
    );


  if (cantidadPorciones <= 0) {

    return "Sin compra";

  }


  const gramosPorPorcion =
    obtenerNumeroUnidad(
      itemCocina.unidad
    );


  if (gramosPorPorcion > 0) {

    const gramos =
      cantidadPorciones *
      gramosPorPorcion;


    if (gramos >= 1000) {

      return `${
        redondear(
          gramos / 1000
        ).toLocaleString("es-CL")
      } kg`;

    }


    return `${
      Math.ceil(gramos)
        .toLocaleString("es-CL")
    } g`;

  }


  return `${
    Math.ceil(
      cantidadPorciones
    ).toLocaleString("es-CL")
  } porciones`;

}


function calcularCapacidadProductos() {

  return data.productos

    .map(
      producto => {

        const ingredientes =
          data.recetas.filter(
            item =>
              item.producto_venta_id ===
              producto.id
          );


        if (
          ingredientes.length === 0
        ) {

          return {
            producto_id:
              producto.id,
            producto:
              producto.nombre,
            capacidad:
              0,
            venta_potencial:
              0,
            limitante:
              "Sin receta"
          };

        }


        let capacidad =
          Number.POSITIVE_INFINITY;

        let limitante =
          "";


        ingredientes.forEach(
          receta => {

            const cocina =
              data.cocina.find(
                item =>
                  item.id ===
                  receta.inventario_cocina_id
              );


            const necesario =
              numero(
                receta.cantidad_necesaria
              );


            const disponible =
              numero(
                cocina?.cantidad
              );


            const posibles =
              necesario > 0
                ? Math.floor(
                    disponible /
                    necesario
                  )
                : 0;


            if (
              posibles <
              capacidad
            ) {

              capacidad =
                posibles;

              limitante =
                cocina?.producto ||
                receta.ingrediente ||
                "Ingrediente";

            }

          }
        );


        if (
          !Number.isFinite(
            capacidad
          )
        ) {

          capacidad = 0;

        }


        capacidad =
          Math.max(
            capacidad,
            0
          );


        return {
          producto_id:
            producto.id,
          producto:
            producto.nombre,
          capacidad,
          venta_potencial:
            capacidad *
            numero(
              producto.precio
            ),
          limitante
        };

      }
    )

    .sort(
      (a, b) =>
        b.venta_potencial -
        a.venta_potencial
    );

}


function calcularCoberturaInventario() {

  const ventasPorProducto =
    new Map(
      data.rankingVentas.map(
        item => [
          Number(
            item.producto_id
          ),
          numero(
            item.cantidad
          )
        ]
      )
    );


  const diasMes =
    Math.max(
      numero(
        data.diasTranscurridosMes
      ),
      1
    );


  return data.cocina

    .map(
      itemCocina => {

        let consumoMes = 0;


        data.recetas
          .filter(
            receta =>
              receta.inventario_cocina_id ===
              itemCocina.id
          )
          .forEach(
            receta => {

              const cantidadVendida =
                numero(
                  ventasPorProducto.get(
                    receta.producto_venta_id
                  )
                );


              consumoMes +=
                cantidadVendida *
                numero(
                  receta.cantidad_necesaria
                );

            }
          );


        const consumoDia =
          consumoMes /
          diasMes;


        const stockCocina =
          numero(
            itemCocina.cantidad
          );


        const bodegaEquivalente =
          obtenerStockBodegaEquivalente(
            itemCocina
          );


        const stockTotalEquivalente =
          stockCocina +
          numero(
            bodegaEquivalente.porciones
          );


        const coberturaDias =
          consumoDia > 0
            ? stockTotalEquivalente /
              consumoDia
            : null;


        const necesidad7Dias =
          consumoDia * 7;


        const faltantePorciones =
          Math.max(
            0,
            necesidad7Dias -
            stockTotalEquivalente
          );


        const compraSugerida =
          consumoDia <= 0

            ? "Sin historial"

            : !bodegaEquivalente.convertible

              ? "Revisar unidad"

              : formatearCompraSugerida(
                  itemCocina,
                  faltantePorciones
                );


        return {
          producto:
            itemCocina.producto,
          unidad:
            itemCocina.unidad,
          stock_cocina:
            stockCocina,
          stock_bodega_equivalente:
            numero(
              bodegaEquivalente.porciones
            ),
          bodega_convertible:
            bodegaEquivalente.convertible,
          consumo_mes:
            consumoMes,
          consumo_dia:
            consumoDia,
          cobertura_dias:
            coberturaDias,
          compra_sugerida:
            compraSugerida
        };

      }
    )

    .sort(
      (a, b) => {

        if (
          a.cobertura_dias === null &&
          b.cobertura_dias === null
        ) {
          return 0;
        }


        if (
          a.cobertura_dias === null
        ) {
          return 1;
        }


        if (
          b.cobertura_dias === null
        ) {
          return -1;
        }


        return (
          a.cobertura_dias -
          b.cobertura_dias
        );

      }
    );

}


function renderResumen() {

  const ivaEstimadoMes =
    data.totalVentasMes *
    19 /
    119;


  const netoEstimadoMes =
    data.totalVentasMes -
    ivaEstimadoMes;


  const margenMes =
    data.totalVentasMes > 0
      ? (
          data.resultadoBrutoMes /
          data.totalVentasMes
        ) * 100
      : 0;


  const cantidadesPorProducto =
    new Map(
      data.rankingVentas.map(
        item => [
          Number(
            item.producto_id
          ),
          numero(
            item.cantidad
          )
        ]
      )
    );


  const productosConCantidad =
    data.productos
      .map(
        producto => ({
          producto:
            producto.nombre,
          cantidad:
            numero(
              cantidadesPorProducto.get(
                producto.id
              )
            )
        })
      )
      .sort(
        (a, b) =>
          b.cantidad -
          a.cantidad
      );


  const hayVentasMes =
    data.rankingVentas.length > 0;


  const masVendido =
    hayVentasMes

      ? (
          productosConCantidad[0] ||
          {
            producto: "Sin datos",
            cantidad: 0
          }
        )

      : {
          producto: "Sin ventas",
          cantidad: 0
        };


  const menosVendido =
    hayVentasMes &&
    productosConCantidad.length > 0

      ? productosConCantidad[
          productosConCantidad.length -
          1
        ]

      : {
          producto: "Sin ventas",
          cantidad: 0
        };


  const capacidades =
    calcularCapacidadProductos();


  const ventaPotencialTotal =
    capacidades.reduce(
      (
        total,
        item
      ) =>
        total +
        numero(
          item.venta_potencial
        ),
      0
    );


  const coberturas =
    calcularCoberturaInventario();


  const stockCritico =
    coberturas.filter(
      item =>
        item.cobertura_dias !== null &&
        item.cobertura_dias < 3
    ).length;


  const valores = {

    totalBodega:
      data.bodega.length,

    totalCocina:
      data.cocina.length,

    totalProductos:
      data.productos.length,

    totalVentas:
      moneda(
        data.totalVentas
      ),

    totalVentasSemana:
      moneda(
        data.totalVentasSemana
      ),

    totalVentasMes:
      moneda(
        data.totalVentasMes
      ),

    totalVentasAnio:
      moneda(
        data.totalVentasAnio
      ),

    cantidadVentasDia:
      Math.round(
        data.cantidadVentasDia
      ).toLocaleString("es-CL"),

    cantidadVentasSemana:
      Math.round(
        data.cantidadVentasSemana
      ).toLocaleString("es-CL"),

    cantidadVentasMes:
      Math.round(
        data.cantidadVentasMes
      ).toLocaleString("es-CL"),

    cantidadVentasAnio:
      Math.round(
        data.cantidadVentasAnio
      ).toLocaleString("es-CL"),

    costoVentasDia:
      moneda(
        data.costoVentasDia
      ),

    costoVentasMes:
      moneda(
        data.costoVentasMes
      ),

    costoDiarioPromedio:
      moneda(
        data.costoDiarioPromedio
      ),

    resultadoBrutoMes:
      moneda(
        data.resultadoBrutoMes
      ),

    margenBrutoMes:
      porcentaje(
        margenMes
      ),

    ivaEstimadoMes:
      moneda(
        ivaEstimadoMes
      ),

    netoEstimadoMes:
      moneda(
        netoEstimadoMes
      ),

    productoMasVendido:
      `${
        masVendido.producto
      } · ${
        masVendido.cantidad
          .toLocaleString("es-CL")
      }`,

    productoMenosVendido:
      `${
        menosVendido.producto
      } · ${
        menosVendido.cantidad
          .toLocaleString("es-CL")
      }`,

    ventaPotencial:
      moneda(
        ventaPotencialTotal
      ),

    stockCritico:
      stockCritico
        .toLocaleString("es-CL")

  };


  Object.entries(
    valores
  ).forEach(

    ([id, valor]) => {

      const elemento =
        $(id);


      if (elemento) {

        elemento.textContent =
          valor;

      }

    }

  );


  // Fecha actual visible en los indicadores del día.
  actualizarFechaResumenDia();


  renderRankingVentas();

  renderCapacidadVentas(
    capacidades
  );

  renderCoberturaInventario(
    coberturas
  );

}



function renderRankingVentas() {

  const tbody =
    $("tablaRankingVentas");


  if (!tbody) {

    return;

  }


  if (
    data.rankingVentas.length === 0
  ) {

    tbody.innerHTML = `

      <tr>

        <td colspan="7">
          Sin ventas registradas este mes.
        </td>

      </tr>

    `;


    return;

  }


  tbody.innerHTML =
    data.rankingVentas

      .map(

        (item, indice) => {

          const margen =
            numero(
              item.total_venta
            ) > 0

              ? (
                  numero(
                    item.resultado_bruto
                  ) /
                  numero(
                    item.total_venta
                  )
                ) * 100

              : 0;


          return `

            <tr>

              <td>
                ${indice + 1}
              </td>

              <td>
                ${escaparHTML(
                  item.producto
                )}
              </td>

              <td>
                ${numero(
                  item.cantidad
                ).toLocaleString("es-CL")}
              </td>

              <td>
                ${moneda(
                  item.total_venta
                )}
              </td>

              <td>
                ${moneda(
                  item.costo
                )}
              </td>

              <td>
                ${moneda(
                  item.resultado_bruto
                )}
              </td>

              <td>
                ${porcentaje(
                  margen
                )}
              </td>

            </tr>

          `;

        }

      )

      .join("");

}



function renderCapacidadVentas(
  capacidades
) {

  const tbody =
    $("tablaCapacidadVentas");


  if (!tbody) {
    return;
  }


  const filas =
    capacidades.filter(
      item =>
        item.limitante !==
        "Sin receta"
    );


  if (
    filas.length === 0
  ) {

    tbody.innerHTML = `

      <tr>
        <td colspan="4">
          Crea recetas para estimar la capacidad de venta.
        </td>
      </tr>

    `;

    return;

  }


  tbody.innerHTML =
    filas

      .map(
        item => `

          <tr>

            <td>
              ${escaparHTML(
                item.producto
              )}
            </td>

            <td>
              ${item.capacidad
                .toLocaleString("es-CL")}
            </td>

            <td>
              ${moneda(
                item.venta_potencial
              )}
            </td>

            <td>
              ${escaparHTML(
                item.limitante
              )}
            </td>

          </tr>

        `
      )

      .join("");

}



function renderCoberturaInventario(
  coberturas
) {

  const tbody =
    $("tablaCoberturaInventario");


  if (!tbody) {
    return;
  }


  if (
    coberturas.length === 0
  ) {

    tbody.innerHTML = `

      <tr>
        <td colspan="6">
          Sin productos en Cocina.
        </td>
      </tr>

    `;

    return;

  }


  tbody.innerHTML =
    coberturas

      .map(
        item => {

          const coberturaTexto =
            item.cobertura_dias === null

              ? "Sin consumo"

              : `${
                  redondear(
                    item.cobertura_dias
                  ).toLocaleString("es-CL")
                } días`;


          const claseCobertura =
            item.cobertura_dias !== null &&
            item.cobertura_dias < 3

              ? "gestion-alerta"

              : "";


          const stockBodegaTexto =
            item.bodega_convertible

              ? redondear(
                  item.stock_bodega_equivalente
                ).toLocaleString("es-CL")

              : "N/D";


          return `

            <tr>

              <td>
                ${escaparHTML(
                  item.producto
                )}
              </td>

              <td>
                ${redondear(
                  item.stock_cocina
                ).toLocaleString("es-CL")}
              </td>

              <td>
                ${stockBodegaTexto}
              </td>

              <td>
                ${redondear(
                  item.consumo_dia
                ).toLocaleString("es-CL")}
              </td>

              <td class="${claseCobertura}">
                ${coberturaTexto}
              </td>

              <td>
                ${escaparHTML(
                  item.compra_sugerida
                )}
              </td>

            </tr>

          `;

        }
      )

      .join("");

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


      const ganancia =
        redondear(
          numero(producto.precio) -
          numero(costoPlato)
        );


      const margen =
        numero(producto.precio) > 0
          ? redondear(
              (
                ganancia /
                numero(producto.precio)
              ) * 100
            )
          : 0;



      tbody.innerHTML += `

        <tr>


          <td>

            ${producto.id}

          </td>


          <td>

            ${producto.nombre}

          </td>


          <td>

            ${
              ingredientesReceta.length > 0 &&
              numero(producto.precio) > 0
                ? moneda(producto.precio)
                : "Pendiente receta"
            }

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

            <strong>
              ${moneda(ganancia)}
            </strong>

          </td>


          <td>

            <strong
              class="${
                margen >= 50
                  ? "ccc-margen-bueno"
                  : margen >= 30
                    ? "ccc-margen-medio"
                    : "ccc-margen-bajo"
              }"
            >
              ${margen.toFixed(1)}%
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


    /*
      En Crear receta deben aparecer TODOS los productos activos,
      incluso los recién creados que todavía no tienen receta ni precio.
      El precio se calcula después de guardar la receta.
    */
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


    /*
      En Ventas solo deben aparecer productos listos para vender:
      activos, con receta guardada y con precio calculado.
    */
    data.productos

      .filter(

        item =>
          item.activo &&
          numero(item.precio) > 0 &&
          data.recetas.some(
            receta =>
              receta.producto_venta_id === item.id
          )

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
