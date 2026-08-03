const API_BASE = "http://localhost:3000/api";

let token = sessionStorage.getItem("ccc_token") || "";

let usuario = JSON.parse(
  sessionStorage.getItem("ccc_usuario") || "null"
);

let data = {
  bodega: [],
  cocina: [],
  productos: [],
  recetas: [],
  ventas: [],
  totalVentas: 0
};

document.addEventListener("DOMContentLoaded", async () => {
  iniciarLogin();
  iniciarNavegacion();
  iniciarBotones();

  if (token && usuario) {
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
});

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
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0
  }).format(numero(valor));
}

function formatearFecha(valor) {
  if (!valor) return "";

  return new Date(valor).toLocaleString("es-CL");
}

function nombreMedioPago(valor) {
  const nombres = {
    efectivo: "Efectivo",
    debito: "Débito",
    credito: "Crédito",
    transferencia: "Transferencia"
  };

  return nombres[valor] || valor || "";
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
    headers["Content-Type"] = "application/json";
  }

  if (requiereToken && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const respuesta = await fetch(
    `${API_BASE}${ruta}`,
    {
      ...opciones,
      headers
    }
  );

  const texto = await respuesta.text();

  let resultado = {};

  if (texto) {
    try {
      resultado = JSON.parse(texto);
    } catch {
      resultado = {
        message: texto
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
    id: Number(item.id),
    producto: item.nombre_producto || "",
    unidad: item.unidad || "",
    cantidad: numero(item.cantidad),
    costo_total: numero(item.costo_total)
  };
}

function normalizarCocina(item) {
  return {
    id: Number(item.id),
    producto: item.nombre_producto || "",
    unidad: item.unidad || "",
    cantidad: numero(item.cantidad),
    costo_unitario: numero(item.costo_unitario),
    costo_total: numero(item.costo_total),
    stock_minimo: numero(item.stock_minimo)
  };
}

function normalizarProducto(item) {
  return {
    id: Number(item.id),
    nombre: item.nombre || "",
    precio: numero(item.precio),
    activo: item.activo !== false
  };
}

function normalizarReceta(item) {
  return {
    id: Number(item.id),

    producto_venta_id: Number(
      item.producto_venta_id
    ),

    producto_venta:
      item.producto_venta || "",

    inventario_cocina_id: Number(
      item.inventario_cocina_id
    ),

    ingrediente:
      item.ingrediente || "",

    unidad:
      item.unidad || "",

    cantidad_necesaria: numero(
      item.cantidad_necesaria
    )
  };
}

/* =====================================================
   CARGA DESDE POSTGRESQL
===================================================== */

async function cargarTodoDesdeBD() {
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
    bodega.map(normalizarBodega);

  data.cocina =
    cocina.map(normalizarCocina);

  data.productos =
    productos.map(normalizarProducto);

  data.recetas =
    recetas.map(normalizarReceta);

  data.totalVentas =
    numero(ventasHoy.total_dia);

  const ventasPorId = new Map();

  ventasHoy.ventas.forEach(venta => {
    ventasPorId.set(
      Number(venta.id),
      venta
    );
  });

  data.ventas = ventasHoy.detalles.map(detalle => {
    const venta = ventasPorId.get(
      Number(detalle.venta_id)
    );

    return {
      id: Number(detalle.id),
      producto: detalle.producto,
      cantidad: numero(detalle.cantidad),
      medio_pago: venta?.medio_pago || "",
      total: numero(detalle.subtotal),
      fecha: venta?.fecha || ""
    };
  });

  renderizarTodo();
}

/* =====================================================
   LOGIN
===================================================== */

function iniciarLogin() {
  const formulario = $("loginForm");

  if (!formulario) return;

  formulario.addEventListener(
    "submit",
    async evento => {
      evento.preventDefault();

      const correo =
        $("correo").value.trim();

      const password =
        $("password").value;

      try {
        const resultado = await api(
          "/auth/login",
          {
            method: "POST",

            body: JSON.stringify({
              correo,
              password
            })
          },
          false
        );

        token = resultado.token;
        usuario = resultado.user;

        sessionStorage.setItem(
          "ccc_token",
          token
        );

        sessionStorage.setItem(
          "ccc_usuario",
          JSON.stringify(usuario)
        );

        mostrarAplicacion();

        await cargarTodoDesdeBD();

        mostrarVista("vistaResumen");
        activarBoton("btnResumen");
      } catch (error) {
        console.error(error);
        alert(error.message);
      }
    }
  );
}

function mostrarAplicacion() {
  $("loginView").style.display = "none";
  $("appView").style.display = "flex";

  $("rolUsuario").textContent =
    usuario?.rol || "";

  $("nombreUsuario").textContent =
    usuario?.nombre || "";
}

function mostrarLogin() {
  $("appView").style.display = "none";
  $("loginView").style.display = "flex";
}

function cerrarSesion() {
  token = "";
  usuario = null;

  sessionStorage.removeItem("ccc_token");
  sessionStorage.removeItem("ccc_usuario");

  data = {
    bodega: [],
    cocina: [],
    productos: [],
    recetas: [],
    ventas: [],
    totalVentas: 0
  };

  mostrarLogin();
}

/* =====================================================
   NAVEGACIÓN
===================================================== */

function iniciarNavegacion() {
  const botones = [
    {
      id: "btnResumen",
      vista: "vistaResumen"
    },
    {
      id: "btnBodega",
      vista: "vistaBodega"
    },
    {
      id: "btnCocina",
      vista: "vistaCocina"
    },
    {
      id: "btnProductos",
      vista: "vistaProductos"
    },
    {
      id: "btnVentas",
      vista: "vistaVentas"
    }
  ];

  botones.forEach(item => {
    $(item.id)?.addEventListener(
      "click",
      async () => {
        try {
          await cargarTodoDesdeBD();

          mostrarVista(item.vista);
          activarBoton(item.id);
        } catch (error) {
          console.error(error);
          alert(error.message);
        }
      }
    );
  });

  $("btnSalir")?.addEventListener(
    "click",
    cerrarSesion
  );
}

function mostrarVista(idVista) {
  const vistas = [
    "vistaResumen",
    "vistaBodega",
    "vistaCocina",
    "vistaProductos",
    "vistaVentas"
  ];

  vistas.forEach(id => {
    const vista = $(id);

    if (vista) {
      vista.style.display =
        id === idVista
          ? "block"
          : "none";
    }
  });
}

function activarBoton(idBoton) {
  const botones = [
    "btnResumen",
    "btnBodega",
    "btnCocina",
    "btnProductos",
    "btnVentas"
  ];

  botones.forEach(id => {
    $(id)?.classList.toggle(
      "active",
      id === idBoton
    );
  });
}

/* =====================================================
   BOTONES
===================================================== */

function iniciarBotones() {
  $("btnActualizar")?.addEventListener(
    "click",
    async () => {
      try {
        await cargarTodoDesdeBD();
      } catch (error) {
        alert(error.message);
      }
    }
  );

  $("btnAgregarBodega")?.addEventListener(
    "click",
    agregarBodega
  );

  $("btnAgregarCocina")?.addEventListener(
    "click",
    agregarCocina
  );

  $("btnCrearProductoVenta")?.addEventListener(
    "click",
    crearProductoVenta
  );

  $("btnAgregarReceta")?.addEventListener(
    "click",
    agregarReceta
  );

  $("btnRegistrarVenta")?.addEventListener(
    "click",
    registrarVenta
  );

  $("tablaBodega")?.addEventListener(
    "click",
    accionesBodega
  );

  $("tablaCocina")?.addEventListener(
    "click",
    accionesCocina
  );

  $("tablaProductos")?.addEventListener(
    "click",
    accionesProductos
  );
}

/* =====================================================
   BODEGA
===================================================== */

async function agregarBodega() {
  const producto =
    $("bodegaProducto").value.trim();

  const unidad =
    $("bodegaUnidad").value.trim();

  const cantidad =
    numero($("bodegaCantidad").value);

  const costo =
    numero($("bodegaCosto").value);

  if (
    !producto ||
    !unidad ||
    cantidad <= 0 ||
    costo <= 0
  ) {
    alert("Completa los datos de bodega");
    return;
  }

  try {
    await api("/bodega", {
      method: "POST",

      body: JSON.stringify({
        nombre_producto: producto,
        unidad,
        cantidad,
        costo_total: costo
      })
    });

    $("bodegaProducto").value = "";
    $("bodegaUnidad").value = "";
    $("bodegaCantidad").value = "";
    $("bodegaCosto").value = "";

    await cargarTodoDesdeBD();
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

function accionesBodega(evento) {
  const boton = evento.target.closest(
    "button[data-action]"
  );

  if (!boton) return;

  const id = Number(boton.dataset.id);

  if (boton.dataset.action === "editar") {
    editarBodega(id);
  }

  if (boton.dataset.action === "eliminar") {
    eliminarBodega(id);
  }
}

async function editarBodega(id) {
  const item = data.bodega.find(
    producto => producto.id === id
  );

  if (!item) return;

  const producto = prompt(
    "Producto",
    item.producto
  );

  if (producto === null) return;

  const unidad = prompt(
    "Unidad",
    item.unidad
  );

  if (unidad === null) return;

  const cantidad = prompt(
    "Cantidad",
    item.cantidad
  );

  if (cantidad === null) return;

  const costo = prompt(
    "Costo total",
    item.costo_total
  );

  if (costo === null) return;

  try {
    await api(`/bodega/${id}`, {
      method: "PUT",

      body: JSON.stringify({
        nombre_producto:
          producto.trim(),

        unidad:
          unidad.trim(),

        cantidad:
          numero(cantidad),

        costo_total:
          numero(costo)
      })
    });

    await cargarTodoDesdeBD();
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

async function eliminarBodega(id) {
  if (
    !confirm("¿Eliminar producto de bodega?")
  ) {
    return;
  }

  try {
    await api(`/bodega/${id}`, {
      method: "DELETE"
    });

    await cargarTodoDesdeBD();
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

/* =====================================================
   COCINA
===================================================== */

/*
  CORRECCIÓN:
  Cocina toma el nombre directamente desde Bodega.
  El usuario solo selecciona el producto y escribe
  la cantidad de gramos de cada porción.
*/

async function agregarCocina() {
  const bodegaId = Number(
    $("selectBodegaCocina").value
  );

  const textoGramos =
    $("cocinaUnidad").value.trim();

  const gramosPorPorcion = Number(
    textoGramos
      .replace(/[^0-9.,]/g, "")
      .replace(",", ".")
  );

  const bodega = data.bodega.find(
    item => item.id === bodegaId
  );

  if (!bodega) {
    alert("Selecciona un producto de bodega");
    return;
  }

  if (gramosPorPorcion <= 0) {
    alert("Ingresa los gramos por porción");
    return;
  }

  const unidad =
    bodega.unidad.toLowerCase().trim();

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

  const cantidadPorciones = Math.floor(
    gramosDisponibles /
    gramosPorPorcion
  );

  if (cantidadPorciones <= 0) {
    alert("No alcanza para una porción");
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

  /*
    El nombre no lo escribe el usuario.
    Se toma directamente del producto de Bodega.
  */
  const nombreCocina =
    bodega.producto;

  const unidadCocina =
    `${gramosPorPorcion} g`;

  const existente = data.cocina.find(
    item =>
      item.producto.toLowerCase() ===
        nombreCocina.toLowerCase() &&
      item.unidad.toLowerCase() ===
        unidadCocina.toLowerCase()
  );

  try {
    await api("/traspasar", {
      method: "POST",

      body: JSON.stringify({
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
    });

    $("selectBodegaCocina").value = "";
    $("cocinaUnidad").value = "";

    await cargarTodoDesdeBD();

    alert(
      `${nombreCocina}: se guardaron ` +
      `${cantidadPorciones} porciones de ` +
      `${unidadCocina}`
    );
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

function accionesCocina(evento) {
  const boton = evento.target.closest(
    "button[data-action]"
  );

  if (!boton) return;

  const id = Number(boton.dataset.id);

  if (boton.dataset.action === "editar") {
    editarCocina(id);
  }

  if (boton.dataset.action === "eliminar") {
    eliminarCocina(id);
  }
}

async function editarCocina(id) {
  const item = data.cocina.find(
    producto => producto.id === id
  );

  if (!item) return;

  const producto = prompt(
    "Producto",
    item.producto
  );

  if (producto === null) return;

  const unidad = prompt(
    "Unidad",
    item.unidad
  );

  if (unidad === null) return;

  const cantidad = prompt(
    "Cantidad",
    item.cantidad
  );

  if (cantidad === null) return;

  const costo = prompt(
    "Costo total",
    item.costo_total
  );

  if (costo === null) return;

  try {
    await api(`/cocina/${id}`, {
      method: "PUT",

      body: JSON.stringify({
        nombre_producto:
          producto.trim(),

        unidad:
          unidad.trim(),

        cantidad:
          numero(cantidad),

        costo_total:
          numero(costo),

        stock_minimo:
          item.stock_minimo
      })
    });

    await cargarTodoDesdeBD();
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

async function eliminarCocina(id) {
  if (
    !confirm("¿Eliminar producto de cocina?")
  ) {
    return;
  }

  try {
    await api(`/cocina/${id}`, {
      method: "DELETE"
    });

    await cargarTodoDesdeBD();
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

/* =====================================================
   PRODUCTOS Y RECETAS
===================================================== */

async function crearProductoVenta() {
  const nombre =
    $("nombreProductoVenta").value.trim();

  const precio =
    numero($("precioProductoVenta").value);

  if (!nombre || precio <= 0) {
    alert("Completa producto y precio");
    return;
  }

  try {
    await api("/productos", {
      method: "POST",

      body: JSON.stringify({
        nombre,
        precio,
        activo: true
      })
    });

    $("nombreProductoVenta").value = "";
    $("precioProductoVenta").value = "";

    await cargarTodoDesdeBD();
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

async function agregarReceta() {
  const productoId = Number(
    $("selectProductoVenta").value
  );

  const cocinaId = Number(
    $("selectProductoCocina").value
  );

  const cantidad = numero(
    $("cantidadReceta").value
  );

  if (
    !productoId ||
    !cocinaId ||
    cantidad <= 0
  ) {
    alert("Completa la receta");
    return;
  }

  try {
    await api("/recetas", {
      method: "POST",

      body: JSON.stringify({
        producto_venta_id:
          productoId,

        inventario_cocina_id:
          cocinaId,

        cantidad_necesaria:
          cantidad
      })
    });

    $("cantidadReceta").value = "";

    await cargarTodoDesdeBD();

    alert("Receta guardada correctamente");
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

function accionesProductos(evento) {
  const boton = evento.target.closest(
    "button[data-action]"
  );

  if (!boton) return;

  const id = Number(boton.dataset.id);

  if (boton.dataset.action === "editar") {
    editarProducto(id);
  }

  if (boton.dataset.action === "eliminar") {
    eliminarProducto(id);
  }
}

async function editarProducto(id) {
  const item = data.productos.find(
    producto => producto.id === id
  );

  if (!item) return;

  const nombre = prompt(
    "Producto",
    item.nombre
  );

  if (nombre === null) return;

  const precio = prompt(
    "Precio",
    item.precio
  );

  if (precio === null) return;

  try {
    await api(`/productos/${id}`, {
      method: "PUT",

      body: JSON.stringify({
        nombre:
          nombre.trim(),

        precio:
          numero(precio),

        activo:
          item.activo
      })
    });

    await cargarTodoDesdeBD();
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

async function eliminarProducto(id) {
  if (!confirm("¿Eliminar producto?")) {
    return;
  }

  try {
    await api(`/productos/${id}`, {
      method: "DELETE"
    });

    await cargarTodoDesdeBD();
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

/* =====================================================
   VENTAS
===================================================== */

async function registrarVenta() {
  const productoId = Number(
    $("selectVentaProducto").value
  );

  const cantidad = numero(
    $("cantidadVenta").value
  );

  const medioPago =
    $("medioPagoVenta").value;

  if (!productoId || cantidad <= 0) {
    alert(
      "Selecciona producto y cantidad"
    );
    return;
  }

  try {
    await api("/ventas", {
      method: "POST",

      body: JSON.stringify({
        medio_pago: medioPago,

        items: [
          {
            producto_venta_id:
              productoId,

            cantidad
          }
        ]
      })
    });

    $("cantidadVenta").value = "";

    await cargarTodoDesdeBD();

    alert("Venta registrada correctamente");
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

/* =====================================================
   RENDER
===================================================== */

function renderizarTodo() {
  renderResumen();
  renderBodega();
  renderCocina();
  renderProductos();
  renderVentas();
  renderSelects();
}

function renderResumen() {
  $("totalBodega").textContent =
    data.bodega.length;

  $("totalCocina").textContent =
    data.cocina.length;

  $("totalProductos").textContent =
    data.productos.length;

  $("totalVentas").textContent =
    moneda(data.totalVentas);
}

function renderBodega() {
  const tbody = $("tablaBodega");

  if (!tbody) return;

  tbody.innerHTML = "";

  data.bodega.forEach(item => {
    tbody.innerHTML += `
      <tr>
        <td>${item.id}</td>
        <td>${item.producto}</td>
        <td>${item.unidad}</td>
        <td>${item.cantidad}</td>
        <td>${moneda(item.costo_total)}</td>

        <td>
          <button
            type="button"
            data-action="editar"
            data-id="${item.id}">
            Editar
          </button>

          <button
            type="button"
            class="eliminar"
            data-action="eliminar"
            data-id="${item.id}">
            Eliminar
          </button>
        </td>
      </tr>
    `;
  });
}

function renderCocina() {
  const tbody = $("tablaCocina");

  if (!tbody) return;

  tbody.innerHTML = "";

  data.cocina.forEach(item => {
    tbody.innerHTML += `
      <tr>
        <td>${item.id}</td>
        <td>${item.producto}</td>
        <td>${item.unidad}</td>
        <td>${item.cantidad}</td>
        <td>${moneda(item.costo_total)}</td>

        <td>
          <button
            type="button"
            data-action="editar"
            data-id="${item.id}">
            Editar
          </button>

          <button
            type="button"
            class="eliminar"
            data-action="eliminar"
            data-id="${item.id}">
            Eliminar
          </button>
        </td>
      </tr>
    `;
  });
}

function renderProductos() {
  const tbody = $("tablaProductos");

  if (!tbody) return;

  tbody.innerHTML = "";

  data.productos.forEach(producto => {
    const receta = data.recetas
      .filter(
        item =>
          item.producto_venta_id ===
          producto.id
      )
      .map(
        item =>
          `${item.ingrediente}: ` +
          `${item.cantidad_necesaria} ` +
          `${item.unidad}`
      )
      .join("<br>");

    tbody.innerHTML += `
      <tr>
        <td>${producto.id}</td>
        <td>${producto.nombre}</td>
        <td>${moneda(producto.precio)}</td>
        <td>${receta || "Sin receta"}</td>

        <td>
          <button
            type="button"
            data-action="editar"
            data-id="${producto.id}">
            Editar
          </button>

          <button
            type="button"
            class="eliminar"
            data-action="eliminar"
            data-id="${producto.id}">
            Eliminar
          </button>
        </td>
      </tr>
    `;
  });
}

function renderVentas() {
  const tbody = $("tablaVentas");

  if (!tbody) return;

  tbody.innerHTML = "";

  data.ventas.forEach(venta => {
    tbody.innerHTML += `
      <tr>
        <td>${venta.id}</td>
        <td>${venta.producto}</td>
        <td>${venta.cantidad}</td>

        <td>
          ${nombreMedioPago(
            venta.medio_pago
          )}
        </td>

        <td>${moneda(venta.total)}</td>

        <td>
          ${formatearFecha(venta.fecha)}
        </td>
      </tr>
    `;
  });
}

function renderSelects() {
  const selectBodega =
    $("selectBodegaCocina");

  const selectProductoVenta =
    $("selectProductoVenta");

  const selectProductoCocina =
    $("selectProductoCocina");

  const selectVentaProducto =
    $("selectVentaProducto");

  if (selectBodega) {
    const valor = selectBodega.value;

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
      .forEach(item => {
        selectBodega.innerHTML += `
          <option value="${item.id}">
            ${item.producto} -
            ${item.cantidad}
            ${item.unidad}
          </option>
        `;
      });

    selectBodega.value = valor;
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
      .filter(item => item.activo)
      .forEach(item => {
        selectProductoVenta.innerHTML += `
          <option value="${item.id}">
            ${item.nombre}
          </option>
        `;
      });

    selectProductoVenta.value = valor;
  }

  if (selectProductoCocina) {
    const valor =
      selectProductoCocina.value;

    selectProductoCocina.innerHTML = `
      <option value="">
        Seleccionar insumo de cocina
      </option>
    `;

    data.cocina.forEach(item => {
      selectProductoCocina.innerHTML += `
        <option value="${item.id}">
          ${item.producto} -
          ${item.cantidad}
          ${item.unidad}
        </option>
      `;
    });

    selectProductoCocina.value = valor;
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
      .filter(item => item.activo)
      .forEach(item => {
        selectVentaProducto.innerHTML += `
          <option value="${item.id}">
            ${item.nombre} -
            ${moneda(item.precio)}
          </option>
        `;
      });

    selectVentaProducto.value = valor;
  }
}