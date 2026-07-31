const STORAGE_KEY = "ccc_db";
const API_BODEGA = "http://localhost:3000/api/bodega";
let data = cargarDatos();

document.addEventListener("DOMContentLoaded", () => {
  iniciarLogin();
  iniciarNavegacion();
  iniciarBotones();
  renderizarTodo();
});

function $(id) {
  return document.getElementById(id);
}

function cargarDatos() {
  const guardado = localStorage.getItem(STORAGE_KEY);

  if (guardado) {
    try {
      const datos = JSON.parse(guardado);

      return {
        bodega: [],
        cocina: datos.cocina || [],
        productos: datos.productos || [],
        recetas: datos.recetas || [],
        ventas: datos.ventas || []
      };
    } catch (error) {
      console.error("Error al cargar datos:", error);
    }
  }

  return {
    bodega: [],
    cocina: [],
    productos: [],
    recetas: [],
    ventas: []
  };
}

function guardarDatos() {
  const datosLocales = {
    bodega: [],
    cocina: data.cocina,
    productos: data.productos,
    recetas: data.recetas,
    ventas: data.ventas
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(datosLocales));
}

function siguienteId(lista) {
  if (lista.length === 0) return 1;
  return Math.max(...lista.map(item => item.id)) + 1;
}

function numero(valor) {
  return Number(valor) || 0;
}

function redondear(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

function moneda(valor) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0
  }).format(numero(valor));
}

function normalizarBodega(item) {
  return {
    id: item.id,
    producto:
      item.producto ??
      item.nombre ??
      item.nombre_producto ??
      item.nombre_materia_prima ??
      item.materia_prima ??
      item.descripcion ??
      item.PRODUCTO ??
      item.NOMBRE ??
      item.NOMBRE_PRODUCTO ??
      "",
    unidad: item.unidad ?? item.UNIDAD ?? "",
    cantidad: numero(
      item.cantidad ??
      item.cantidad_total ??
      item.stock ??
      item.CANTIDAD ??
      item.CANTIDAD_TOTAL
    ),
    costo_total: numero(
      item.costo_total ??
      item.costo ??
      item.total ??
      item.COSTO_TOTAL ??
      item.COSTO
    )
  };
}

async function cargarBodegaDesdeBD() {
  try {
    const res = await fetch(API_BODEGA);

    if (!res.ok) {
      throw new Error("No se pudo cargar bodega desde la base de datos");
    }

    const registros = await res.json();
    data.bodega = registros.map(normalizarBodega);

    renderBodega();
  } catch (error) {
    console.error("Error cargando bodega:", error);
    alert("No se pudo cargar bodega desde la base de datos");
  }
}

/* LOGIN */

function iniciarLogin() {
  const loginForm = $("loginForm");

  if (!loginForm) return;

  loginForm.addEventListener("submit", async e => {
    e.preventDefault();

    const correo = $("correo").value.trim();
    const password = $("password").value.trim();

    if (correo === "admin@ccc.cl" && password === "123456") {
      $("loginView").style.display = "none";
      $("appView").style.display = "flex";

      $("rolUsuario").textContent = "Administrador";
      $("nombreUsuario").textContent = "admin";

      await cargarBodegaDesdeBD();

      mostrarVista("vistaResumen");
      activarBoton("btnResumen");
      renderizarTodo();
    } else {
      alert("Correo o contraseña incorrectos");
    }
  });
}

/* NAVEGACIÓN */

function iniciarNavegacion() {
  const botones = [
    { id: "btnResumen", vista: "vistaResumen" },
    { id: "btnBodega", vista: "vistaBodega" },
    { id: "btnCocina", vista: "vistaCocina" },
    { id: "btnProductos", vista: "vistaProductos" },
    { id: "btnVentas", vista: "vistaVentas" }
  ];

  botones.forEach(item => {
    const boton = $(item.id);

    if (boton) {
      boton.addEventListener("click", async () => {
        if (item.vista === "vistaBodega" || item.vista === "vistaCocina") {
          await cargarBodegaDesdeBD();
        }

        mostrarVista(item.vista);
        activarBoton(item.id);
        renderizarTodo();
      });
    }
  });

  const btnSalir = $("btnSalir");

  if (btnSalir) {
    btnSalir.addEventListener("click", () => {
      $("appView").style.display = "none";
      $("loginView").style.display = "flex";
    });
  }
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
      vista.style.display = id === idVista ? "block" : "none";
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
    const boton = $(id);

    if (boton) {
      boton.classList.toggle("active", id === idBoton);
    }
  });
}

/* BOTONES */

function iniciarBotones() {
  $("btnActualizar")?.addEventListener("click", async () => {
    await cargarBodegaDesdeBD();
    renderizarTodo();
  });

  $("btnAgregarBodega")?.addEventListener("click", agregarBodega);
  $("btnAgregarCocina")?.addEventListener("click", agregarCocina);

  $("btnCrearProductoVenta")?.addEventListener("click", crearProductoVenta);
  $("btnAgregarReceta")?.addEventListener("click", agregarReceta);
  $("btnRegistrarVenta")?.addEventListener("click", registrarVenta);

  $("tablaBodega")?.addEventListener("click", accionesBodega);
  $("tablaCocina")?.addEventListener("click", accionesCocina);
  $("tablaProductos")?.addEventListener("click", accionesProductos);
}

/* BODEGA */

async function agregarBodega() {
  const producto = $("bodegaProducto").value.trim();
  const unidad = $("bodegaUnidad").value.trim();
  const cantidad = numero($("bodegaCantidad").value);
  const costo = numero($("bodegaCosto").value);

  if (!producto || !unidad || cantidad <= 0 || costo <= 0) {
    alert("Completa los datos de bodega");
    return;
  }

  try {
    const res = await fetch(API_BODEGA, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        producto,
        nombre: producto,
        unidad,
        cantidad,
        cantidad_total: cantidad,
        costo_total: costo
      })
    });

    if (!res.ok) {
      throw new Error("No se pudo agregar producto a bodega");
    }

    limpiarFormularioBodega();

    await cargarBodegaDesdeBD();
    renderizarTodo();
  } catch (error) {
    console.error("Error agregando bodega:", error);
    alert("No se pudo agregar el producto a la base de datos");
  }
}

function limpiarFormularioBodega() {
  $("bodegaProducto").value = "";
  $("bodegaUnidad").value = "";
  $("bodegaCantidad").value = "";
  $("bodegaCosto").value = "";
}

function accionesBodega(e) {
  const id = Number(e.target.dataset.id);

  if (e.target.dataset.action === "editar") {
    editarBodega(id);
  }

  if (e.target.dataset.action === "eliminar") {
    eliminarBodega(id);
  }
}

async function editarBodega(id) {
  const item = data.bodega.find(p => p.id === id);
  if (!item) return;

  const producto = prompt("Producto", item.producto);
  if (producto === null) return;

  const unidad = prompt("Unidad", item.unidad);
  if (unidad === null) return;

  const cantidad = prompt("Cantidad", item.cantidad);
  if (cantidad === null) return;

  const costo = prompt("Costo total", item.costo_total);
  if (costo === null) return;

  if (!producto.trim() || !unidad.trim() || numero(cantidad) < 0 || numero(costo) < 0) {
    alert("Datos inválidos");
    return;
  }

  try {
    const res = await fetch(`${API_BODEGA}/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        producto: producto.trim(),
        nombre: producto.trim(),
        unidad: unidad.trim(),
        cantidad: numero(cantidad),
        cantidad_total: numero(cantidad),
        costo_total: numero(costo)
      })
    });

    if (!res.ok) {
      throw new Error("No se pudo editar producto de bodega");
    }

    await cargarBodegaDesdeBD();
    renderizarTodo();
  } catch (error) {
    console.error("Error editando bodega:", error);
    alert("No se pudo editar el producto en la base de datos");
  }
}

async function eliminarBodega(id) {
  if (!confirm("¿Eliminar producto de bodega?")) return;

  try {
    const res = await fetch(`${API_BODEGA}/${id}`, {
      method: "DELETE"
    });

    if (!res.ok) {
      throw new Error("No se pudo eliminar producto de bodega");
    }

    await cargarBodegaDesdeBD();
    renderizarTodo();
  } catch (error) {
    console.error("Error eliminando bodega:", error);
    alert("No se pudo eliminar el producto de la base de datos");
  }
}

/* COCINA */

function agregarCocina() {
  const bodegaId = Number($("selectBodegaCocina").value);
  const productoCocina = $("cocinaProducto").value.trim();

  const gramosTexto = $("cocinaUnidad").value.trim();
  const gramosPorPorcion = Number(gramosTexto.replace(/[^0-9.]/g, ""));

  const productoBodegaOriginal = data.bodega.find(p => p.id === bodegaId);

  if (!productoBodegaOriginal) {
    alert("Selecciona un producto de bodega");
    return;
  }

  const productoBodega = normalizarBodega(productoBodegaOriginal);

  if (!productoCocina || gramosPorPorcion <= 0) {
    alert("Ingresa producto de cocina y gramos por porción");
    return;
  }

  if (productoBodega.cantidad <= 0 || productoBodega.costo_total <= 0) {
    alert("Este producto de bodega no tiene stock disponible");
    return;
  }

  const unidadBodega = productoBodega.unidad.toLowerCase().trim();

  let gramosTotalesBodega = 0;

  if (
    unidadBodega === "kg" ||
    unidadBodega === "kilo" ||
    unidadBodega === "kilos" ||
    unidadBodega === "kilogramo" ||
    unidadBodega === "kilogramos"
  ) {
    gramosTotalesBodega = productoBodega.cantidad * 1000;
  } else if (
    unidadBodega === "g" ||
    unidadBodega === "gr" ||
    unidadBodega === "gramo" ||
    unidadBodega === "gramos"
  ) {
    gramosTotalesBodega = productoBodega.cantidad;
  } else {
    alert("Para porcionar, la unidad de bodega debe ser kg o g");
    return;
  }

  const cantidadPorciones = Math.floor(gramosTotalesBodega / gramosPorPorcion);

  if (cantidadPorciones <= 0) {
    alert("No alcanza para crear una porción");
    return;
  }

  const costoTotalCocina = redondear(productoBodega.costo_total);
  const costoUnitarioCocina = redondear(costoTotalCocina / cantidadPorciones);
  const unidadCocina = `${gramosPorPorcion} g`;

  const existente = data.cocina.find(item =>
    item.producto.toLowerCase() === productoCocina.toLowerCase() &&
    item.unidad.toLowerCase() === unidadCocina.toLowerCase()
  );

  if (existente) {
    existente.cantidad = redondear(existente.cantidad + cantidadPorciones);
    existente.costo_total = redondear(existente.costo_total + costoTotalCocina);
    existente.costo_unitario = redondear(existente.costo_total / existente.cantidad);
  } else {
    data.cocina.push({
      id: siguienteId(data.cocina),
      producto: productoCocina,
      unidad: unidadCocina,
      cantidad: cantidadPorciones,
      costo_unitario: costoUnitarioCocina,
      costo_total: costoTotalCocina
    });
  }

  productoBodegaOriginal.cantidad = 0;
  productoBodegaOriginal.cantidad_total = 0;
  productoBodegaOriginal.costo_total = 0;

  limpiarFormularioCocina();

  guardarDatos();
  renderizarTodo();

  alert(
    `Se crearon ${cantidadPorciones} porciones de ${gramosPorPorcion} g. Valor por porción: ${moneda(costoUnitarioCocina)}`
  );
}

function limpiarFormularioCocina() {
  $("selectBodegaCocina").value = "";
  $("cocinaProducto").value = "";
  $("cocinaUnidad").value = "";
}

function accionesCocina(e) {
  const id = Number(e.target.dataset.id);

  if (e.target.dataset.action === "editar") {
    editarCocina(id);
  }

  if (e.target.dataset.action === "eliminar") {
    eliminarCocina(id);
  }
}

function editarCocina(id) {
  const item = data.cocina.find(p => p.id === id);
  if (!item) return;

  const producto = prompt("Producto", item.producto);
  if (producto === null) return;

  const unidad = prompt("Unidad", item.unidad);
  if (unidad === null) return;

  const cantidad = prompt("Cantidad", item.cantidad);
  if (cantidad === null) return;

  const costo = prompt("Costo total", item.costo_total);
  if (costo === null) return;

  if (!producto.trim() || !unidad.trim() || numero(cantidad) < 0 || numero(costo) < 0) {
    alert("Datos inválidos");
    return;
  }

  item.producto = producto.trim();
  item.unidad = unidad.trim();
  item.cantidad = numero(cantidad);
  item.costo_total = numero(costo);
  item.costo_unitario = item.cantidad > 0 ? redondear(item.costo_total / item.cantidad) : 0;

  guardarDatos();
  renderizarTodo();
}

function eliminarCocina(id) {
  if (!confirm("¿Eliminar producto de cocina?")) return;

  data.cocina = data.cocina.filter(p => p.id !== id);
  data.recetas = data.recetas.filter(r => r.cocina_id !== id);

  guardarDatos();
  renderizarTodo();
}

/* PRODUCTOS Y RECETAS */

function crearProductoVenta() {
  const nombre = $("nombreProductoVenta").value.trim();
  const precio = numero($("precioProductoVenta").value);

  if (!nombre || precio <= 0) {
    alert("Completa producto y precio");
    return;
  }

  data.productos.push({
    id: siguienteId(data.productos),
    nombre,
    precio
  });

  $("nombreProductoVenta").value = "";
  $("precioProductoVenta").value = "";

  guardarDatos();
  renderizarTodo();
}

function agregarReceta() {
  const productoId = Number($("selectProductoVenta").value);
  const cocinaId = Number($("selectProductoCocina").value);
  const cantidad = numero($("cantidadReceta").value);

  if (!productoId || !cocinaId || cantidad <= 0) {
    alert("Completa la receta");
    return;
  }

  data.recetas.push({
    id: siguienteId(data.recetas),
    producto_id: productoId,
    cocina_id: cocinaId,
    cantidad
  });

  $("cantidadReceta").value = "";

  guardarDatos();
  renderizarTodo();
}

function accionesProductos(e) {
  const id = Number(e.target.dataset.id);

  if (e.target.dataset.action === "editar") {
    editarProducto(id);
  }

  if (e.target.dataset.action === "eliminar") {
    eliminarProducto(id);
  }
}

function editarProducto(id) {
  const item = data.productos.find(p => p.id === id);
  if (!item) return;

  const nombre = prompt("Producto", item.nombre);
  if (nombre === null) return;

  const precio = prompt("Precio", item.precio);
  if (precio === null) return;

  if (!nombre.trim() || numero(precio) <= 0) {
    alert("Datos inválidos");
    return;
  }

  item.nombre = nombre.trim();
  item.precio = numero(precio);

  guardarDatos();
  renderizarTodo();
}

function eliminarProducto(id) {
  if (!confirm("¿Eliminar producto?")) return;

  data.productos = data.productos.filter(p => p.id !== id);
  data.recetas = data.recetas.filter(r => r.producto_id !== id);

  guardarDatos();
  renderizarTodo();
}

/* VENTAS */

function registrarVenta() {
  const productoId = Number($("selectVentaProducto").value);
  const cantidad = numero($("cantidadVenta").value);
  const medioPago = $("medioPagoVenta").value;

  const producto = data.productos.find(p => p.id === productoId);

  if (!producto || cantidad <= 0) {
    alert("Selecciona producto y cantidad");
    return;
  }

  const receta = data.recetas.filter(r => r.producto_id === productoId);

  if (receta.length === 0) {
    alert("Este producto no tiene receta");
    return;
  }

  for (const item of receta) {
    const insumo = data.cocina.find(p => p.id === item.cocina_id);
    const requerido = item.cantidad * cantidad;

    if (!insumo || insumo.cantidad < requerido) {
      alert("No hay suficiente inventario de cocina");
      return;
    }
  }

  receta.forEach(item => {
    const insumo = data.cocina.find(p => p.id === item.cocina_id);
    const requerido = item.cantidad * cantidad;
    const costoUnitario = insumo.cantidad > 0 ? insumo.costo_total / insumo.cantidad : 0;
    const costoDescuento = redondear(costoUnitario * requerido);

    insumo.cantidad = redondear(insumo.cantidad - requerido);
    insumo.costo_total = redondear(insumo.costo_total - costoDescuento);
    insumo.costo_unitario = insumo.cantidad > 0 ? redondear(insumo.costo_total / insumo.cantidad) : 0;

    if (insumo.cantidad <= 0) {
      insumo.cantidad = 0;
      insumo.costo_total = 0;
      insumo.costo_unitario = 0;
    }
  });

  data.ventas.push({
    id: siguienteId(data.ventas),
    producto_id: producto.id,
    producto: producto.nombre,
    cantidad,
    medio_pago: medioPago,
    total: producto.precio * cantidad,
    fecha: new Date().toLocaleString("es-CL")
  });

  $("cantidadVenta").value = "";

  guardarDatos();
  renderizarTodo();
}

/* RENDER */

function renderizarTodo() {
  renderResumen();
  renderBodega();
  renderCocina();
  renderProductos();
  renderVentas();
  renderSelects();
}

function renderResumen() {
  $("totalBodega").textContent = data.bodega.length;
  $("totalCocina").textContent = data.cocina.length;
  $("totalProductos").textContent = data.productos.length;

  const totalVentas = data.ventas.reduce((sum, venta) => sum + venta.total, 0);
  $("totalVentas").textContent = moneda(totalVentas);
}

function renderBodega() {
  const tbody = $("tablaBodega");
  if (!tbody) return;

  tbody.innerHTML = "";

  data.bodega.forEach(registro => {
    const item = normalizarBodega(registro);

    tbody.innerHTML += `
      <tr>
        <td>${item.id}</td>
        <td>${item.producto}</td>
        <td>${item.unidad}</td>
        <td>${item.cantidad}</td>
        <td>${moneda(item.costo_total)}</td>
        <td>
          <button data-action="editar" data-id="${item.id}">Editar</button>
          <button class="eliminar" data-action="eliminar" data-id="${item.id}">Eliminar</button>
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
          <button data-action="editar" data-id="${item.id}">Editar</button>
          <button class="eliminar" data-action="eliminar" data-id="${item.id}">Eliminar</button>
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
      .filter(r => r.producto_id === producto.id)
      .map(r => {
        const insumo = data.cocina.find(c => c.id === r.cocina_id);
        return insumo ? `${insumo.producto}: ${r.cantidad} ${insumo.unidad}` : "";
      })
      .filter(Boolean)
      .join("<br>");

    tbody.innerHTML += `
      <tr>
        <td>${producto.id}</td>
        <td>${producto.nombre}</td>
        <td>${moneda(producto.precio)}</td>
        <td>${receta || "Sin receta"}</td>
        <td>
          <button data-action="editar" data-id="${producto.id}">Editar</button>
          <button class="eliminar" data-action="eliminar" data-id="${producto.id}">Eliminar</button>
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
        <td>${venta.medio_pago}</td>
        <td>${moneda(venta.total)}</td>
        <td>${venta.fecha}</td>
      </tr>
    `;
  });
}

function renderSelects() {
  const selectBodegaCocina = $("selectBodegaCocina");
  const selectProductoVenta = $("selectProductoVenta");
  const selectProductoCocina = $("selectProductoCocina");
  const selectVentaProducto = $("selectVentaProducto");

  if (selectBodegaCocina) {
    const valorActual = selectBodegaCocina.value;

    selectBodegaCocina.innerHTML = `<option value="">Seleccionar producto de bodega</option>`;

    data.bodega
      .map(normalizarBodega)
      .filter(item => item.cantidad > 0 && item.costo_total > 0)
      .forEach(item => {
        selectBodegaCocina.innerHTML += `
          <option value="${item.id}">
            ${item.producto} - ${item.cantidad} ${item.unidad}
          </option>
        `;
      });

    selectBodegaCocina.value = valorActual;
  }

  if (selectProductoVenta) {
    const valorActual = selectProductoVenta.value;

    selectProductoVenta.innerHTML = `<option value="">Seleccionar producto</option>`;

    data.productos.forEach(item => {
      selectProductoVenta.innerHTML += `
        <option value="${item.id}">${item.nombre}</option>
      `;
    });

    selectProductoVenta.value = valorActual;
  }

  if (selectProductoCocina) {
    const valorActual = selectProductoCocina.value;

    selectProductoCocina.innerHTML = `<option value="">Seleccionar insumo de cocina</option>`;

    data.cocina.forEach(item => {
      selectProductoCocina.innerHTML += `
        <option value="${item.id}">
          ${item.producto} - ${item.cantidad} ${item.unidad}
        </option>
      `;
    });

    selectProductoCocina.value = valorActual;
  }

  if (selectVentaProducto) {
    const valorActual = selectVentaProducto.value;

    selectVentaProducto.innerHTML = `<option value="">Seleccionar producto</option>`;

    data.productos.forEach(item => {
      selectVentaProducto.innerHTML += `
        <option value="${item.id}">${item.nombre} - ${moneda(item.precio)}</option>
      `;
    });

    selectVentaProducto.value = valorActual;
  }
}