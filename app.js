/* =========================================
   CONFIGURACIÓN Y DATOS
========================================= */

function obtenerDatos(clave) {
    try {
        return JSON.parse(localStorage.getItem(clave)) || [];
    } catch {
        return [];
    }
}

function guardarDatos(clave, datos) {
    localStorage.setItem(clave, JSON.stringify(datos));
}

function dinero(valor) {
    return "$" + Number(valor || 0).toFixed(2);
}

function textoSeguro(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[caracter]);
}

function fechaActual() {
    return new Date().toLocaleDateString("es-EC");
}

let carrito = [];
let usuarioActual = null;

const PERMISOS_SECCIONES = [
    "ventas",
    "cuentas",
    "inventario",
    "movimientos",
    "reportes"
];


/* =========================================
   SISTEMA DE USUARIOS
========================================= */

function inicializarUsuarios() {
    let usuarios = obtenerDatos("usuarios");

    if (usuarios.length === 0) {
        usuarios.push({
            id: 1,
            nombre: "Administrador",
            usuario: "admin",
            contrasena: "Carmita2026!",
            rol: "administrador",
            permisos: PERMISOS_SECCIONES.slice()
        });

        guardarDatos("usuarios", usuarios);
    }
}

function obtenerUsuarios() {
    return obtenerDatos("usuarios");
}

function guardarUsuarios(usuarios) {
    guardarDatos("usuarios", usuarios);
}

function esAdministrador() {
    return usuarioActual &&
        usuarioActual.rol === "administrador";
}

function tienePermiso(seccion) {
    if (!usuarioActual) return false;

    if (seccion === "inicio") return true;

    if (seccion === "usuarios") {
        return esAdministrador();
    }

    if (esAdministrador()) return true;

    return Array.isArray(usuarioActual.permisos) &&
        usuarioActual.permisos.includes(seccion);
}

function verificarPermiso(seccion) {
    if (!usuarioActual) {
        alert("Debe iniciar sesión.");
        return false;
    }

    if (!tienePermiso(seccion)) {
        alert("No tiene permiso para realizar esta acción.");
        return false;
    }

    return true;
}


/* =========================================
   INICIO DE SESIÓN
========================================= */

function iniciarSesion(event) {
    event.preventDefault();

    const usuario = document.getElementById("loginUsuario").value.trim();
    const contrasena = document.getElementById("loginContrasena").value;
    const mensaje = document.getElementById("mensajeLogin");

    const usuarios = obtenerUsuarios();

    const encontrado = usuarios.find(u =>
        u.usuario.toLowerCase() === usuario.toLowerCase() &&
        u.contrasena === contrasena
    );

    if (!encontrado) {
        mensaje.textContent = "Usuario o contraseña incorrectos.";
        mensaje.style.color = "#dc2626";
        return;
    }

    usuarioActual = encontrado;

    localStorage.setItem(
        "sesionMicroCarmita",
        JSON.stringify({ id: encontrado.id })
    );

    mostrarAplicacion();
}

function mostrarAplicacion() {
    const login = document.getElementById("pantallaLogin");
    const aplicacion = document.getElementById("aplicacion");

    if (!usuarioActual || !login || !aplicacion) return;

    login.style.display = "none";
    aplicacion.style.display = "flex";

    const nombreActivo = document.getElementById("nombreUsuarioActivo");
    const rolActivo = document.getElementById("rolUsuarioActivo");

    if (nombreActivo) {
        nombreActivo.textContent = usuarioActual.nombre;
    }

    if (rolActivo) {
        rolActivo.textContent =
            usuarioActual.rol === "administrador"
                ? "Administrador"
                : "Empleado";
    }

    const aviso = document.getElementById("avisoBienvenida");
    const texto = document.getElementById("textoBienvenida");

    if (aviso && texto) {
        texto.textContent = "¡Bienvenido, " + usuarioActual.nombre + "!";
        aviso.style.display = "block";

        setTimeout(() => {
            aviso.style.display = "none";
        }, 5000);
    }

    const menuUsuarios = document.getElementById("menuUsuarios");

    if (menuUsuarios) {
        menuUsuarios.style.display =
            esAdministrador() ? "" : "none";
    }

    aplicarPermisosMenu();

    document.querySelectorAll(".seccion").forEach(seccion => {
        seccion.classList.remove("activa-seccion");
    });

    const inicio = document.getElementById("inicio");

    if (inicio) {
        inicio.classList.add("activa-seccion");
    }

    document.querySelectorAll(".menu").forEach(btn => {
        btn.classList.remove("activo");
    });

    const botones = document.querySelectorAll(".menu");

    if (botones.length > 0) {
        botones[0].classList.add("activo");
    }

    actualizarTodo();
}

function aplicarPermisosMenu() {
    document.querySelectorAll(".menu").forEach(boton => {
        const onclick = boton.getAttribute("onclick");

        if (!onclick) return;

        const coincidencia = onclick.match(
            /mostrarSeccion\('([^']+)'/
        );

        if (!coincidencia) return;

        const seccion = coincidencia[1];

        boton.style.display =
            tienePermiso(seccion) ? "" : "none";
    });
}

function cerrarSesion() {
    if (!confirm("¿Desea cerrar sesión?")) return;

    usuarioActual = null;
    carrito = [];

    localStorage.removeItem("sesionMicroCarmita");

    document.getElementById("aplicacion").style.display = "none";
    document.getElementById("pantallaLogin").style.display = "flex";

    document.getElementById("loginUsuario").value = "";
    document.getElementById("loginContrasena").value = "";
    document.getElementById("mensajeLogin").textContent = "";

    const aviso = document.getElementById("avisoBienvenida");

    if (aviso) {
        aviso.style.display = "none";
    }
}

function recuperarSesion() {
    const sesion = localStorage.getItem("sesionMicroCarmita");

    if (!sesion) return;

    try {
        const datosSesion = JSON.parse(sesion);
        const usuarios = obtenerUsuarios();

        const usuario = usuarios.find(u =>
            String(u.id) === String(datosSesion.id)
        );

        if (usuario) {
            usuarioActual = usuario;
            mostrarAplicacion();
        } else {
            localStorage.removeItem("sesionMicroCarmita");
        }

    } catch {
        localStorage.removeItem("sesionMicroCarmita");
    }
}


/* =========================================
   NAVEGACIÓN
========================================= */

function mostrarSeccion(nombreSeccion, boton) {
    if (!verificarPermiso(nombreSeccion)) return;

    document.querySelectorAll(".seccion").forEach(seccion => {
        seccion.classList.remove("activa-seccion");
    });

    const seleccionada = document.getElementById(nombreSeccion);

    if (seleccionada) {
        seleccionada.classList.add("activa-seccion");
    }

    document.querySelectorAll(".menu").forEach(btn => {
        btn.classList.remove("activo");
    });

    if (boton) {
        boton.classList.add("activo");
    }

    if (nombreSeccion === "usuarios") {
        mostrarUsuarios();
    }

    actualizarTodo();
}


/* =========================================
   REGISTRO DE MOVIMIENTOS
========================================= */

function agregarMovimiento(tipo, descripcion, valor) {
    const movimientos = obtenerDatos("movimientos");

    movimientos.push({
        id: Date.now() + Math.random(),
        tipo,
        descripcion,
        valor: Number(valor),
        fecha: fechaActual()
    });

    guardarDatos("movimientos", movimientos);
}


/* =========================================
   PRODUCTOS PARA VENTAS
========================================= */

function cargarProductosVenta() {
    const selector = document.getElementById("ventaProducto");

    if (!selector) return;

    const inventario = obtenerDatos("inventario");
    const seleccionado = selector.value;

    selector.innerHTML = `
        <option value="">Seleccione un producto</option>
    `;

    inventario.forEach(producto => {
        if (Number(producto.cantidad) > 0) {
            const opcion = document.createElement("option");

            opcion.value = producto.id;
            opcion.textContent =
                producto.nombre + " - Disponible: " + producto.cantidad;

            selector.appendChild(opcion);
        }
    });

    if (
        seleccionado &&
        inventario.some(p =>
            String(p.id) === seleccionado &&
            Number(p.cantidad) > 0
        )
    ) {
        selector.value = seleccionado;
    }

    actualizarPrecioVenta();
}

function actualizarPrecioVenta() {
    const selector = document.getElementById("ventaProducto");
    const campoPrecio = document.getElementById("ventaPrecio");

    if (!selector || !campoPrecio) return;

    const inventario = obtenerDatos("inventario");

    const producto = inventario.find(p =>
        String(p.id) === selector.value
    );

    campoPrecio.value = producto
        ? Number(producto.precio).toFixed(2)
        : "";
}


/* =========================================
   AGREGAR PRODUCTOS AL CARRITO
========================================= */

function agregarAlCarrito() {
    if (!verificarPermiso("ventas")) return;

    const selector = document.getElementById("ventaProducto");
    const campoCantidad = document.getElementById("ventaCantidad");

    const idProducto = selector.value;
    const cantidad = Number(campoCantidad.value);

    if (!idProducto) {
        alert("Seleccione un producto.");
        return;
    }

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
        alert("Ingrese una cantidad válida.");
        return;
    }

    const inventario = obtenerDatos("inventario");

    const producto = inventario.find(p =>
        String(p.id) === idProducto
    );

    if (!producto) {
        alert("El producto no existe en el inventario.");
        return;
    }

    const existente = carrito.find(item =>
        String(item.id) === String(producto.id)
    );

    const cantidadActual = existente ? existente.cantidad : 0;
    const nuevaCantidad = cantidadActual + cantidad;

    if (nuevaCantidad > Number(producto.cantidad)) {
        alert(
            "No hay suficientes unidades de " + producto.nombre +
            ".\nExistencias disponibles: " + producto.cantidad
        );

        return;
    }

    if (existente) {
        existente.cantidad = nuevaCantidad;
    } else {
        carrito.push({
            id: producto.id,
            nombre: producto.nombre,
            precio: Number(producto.precio),
            cantidad
        });
    }

    mostrarCarrito();

    campoCantidad.value = 1;
    selector.value = "";
    actualizarPrecioVenta();
}


/* =========================================
   MOSTRAR CARRITO
========================================= */

function mostrarCarrito() {
    const lista = document.getElementById("listaCarrito");
    const totalElemento = document.getElementById("totalCarrito");

    if (!lista || !totalElemento) return;

    lista.innerHTML = "";

    if (carrito.length === 0) {
        lista.innerHTML = `
            <tr>
                <td colspan="5">No hay productos agregados.</td>
            </tr>
        `;

        totalElemento.textContent = dinero(0);
        return;
    }

    let total = 0;

    carrito.forEach(item => {
        const subtotal = Number(item.precio) * Number(item.cantidad);
        total += subtotal;

        const fila = document.createElement("tr");

        fila.innerHTML = `
            <td>${textoSeguro(item.nombre)}</td>
            <td>${dinero(item.precio)}</td>
            <td>${item.cantidad}</td>
            <td>${dinero(subtotal)}</td>
            <td>
                <button class="btn-pagar"
                    onclick="quitarDelCarrito('${textoSeguro(item.id)}')">
                    Quitar
                </button>
            </td>
        `;

        lista.appendChild(fila);
    });

    totalElemento.textContent = dinero(total);
}

function quitarDelCarrito(id) {
    if (!verificarPermiso("ventas")) return;

    carrito = carrito.filter(item =>
        String(item.id) !== String(id)
    );

    mostrarCarrito();
}


/* =========================================
   REGISTRAR VENTA
========================================= */

function registrarVenta() {
    if (!verificarPermiso("ventas")) return;

    const cliente = document.getElementById("ventaCliente").value.trim();
    const tipo = document.getElementById("ventaTipo").value;

    if (!cliente) {
        alert("Ingrese el nombre del cliente.");
        return;
    }

    if (carrito.length === 0) {
        alert("Agregue al menos un producto al carrito.");
        return;
    }

    const inventario = obtenerDatos("inventario");

    for (const item of carrito) {
        const producto = inventario.find(p =>
            String(p.id) === String(item.id)
        );

        if (!producto) {
            alert("Uno de los productos ya no existe en el inventario.");
            return;
        }

        if (Number(producto.cantidad) < Number(item.cantidad)) {
            alert(
                "No hay suficientes unidades de " + producto.nombre +
                ". Existencias actuales: " + producto.cantidad
            );

            return;
        }
    }

    const total = carrito.reduce(
        (suma, item) =>
            suma + Number(item.precio) * Number(item.cantidad),
        0
    );

    const cantidadTotal = carrito.reduce(
        (suma, item) => suma + Number(item.cantidad),
        0
    );

    const productosVenta = carrito.map(item => ({
        id: item.id,
        nombre: item.nombre,
        precio: Number(item.precio),
        cantidad: Number(item.cantidad),
        subtotal: Number(item.precio) * Number(item.cantidad)
    }));

    const nombresProductos = productosVenta
        .map(item => item.nombre)
        .join(", ");

    const venta = {
        id: Date.now(),
        cliente,
        producto: nombresProductos,
        productos: productosVenta,
        cantidad: cantidadTotal,
        precio: total / cantidadTotal,
        total,
        tipo,
        fecha: fechaActual()
    };

    productosVenta.forEach(item => {
        const producto = inventario.find(p =>
            String(p.id) === String(item.id)
        );

        producto.cantidad =
            Number(producto.cantidad) - Number(item.cantidad);
    });

    guardarDatos("inventario", inventario);

    const ventas = obtenerDatos("ventas");
    ventas.push(venta);

    guardarDatos("ventas", ventas);

    if (tipo === "fiado") {
        const cuentas = obtenerDatos("cuentas");

        cuentas.push({
            id: venta.id,
            cliente,
            producto: nombresProductos,
            total,
            abonado: 0,
            saldo: total,
            fecha: fechaActual(),
            estado: "Pendiente",
            abonos: []
        });

        guardarDatos("cuentas", cuentas);

    } else {
        agregarMovimiento(
            "ingreso",
            "Venta al contado: " + nombresProductos,
            total
        );
    }

    alert(
        "Venta registrada correctamente.\n" +
        "Cliente: " + cliente +
        "\nProductos: " + nombresProductos +
        "\nTotal: " + dinero(total)
    );

    carrito = [];

    document.getElementById("ventaCliente").value = "";
    document.getElementById("ventaProducto").value = "";
    document.getElementById("ventaCantidad").value = 1;
    document.getElementById("ventaPrecio").value = "";
    document.getElementById("ventaTipo").value = "contado";

    actualizarTodo();
}


/* =========================================
   MOSTRAR VENTAS
========================================= */

function mostrarVentas() {
    const lista = document.getElementById("listaVentas");
    const ventas = obtenerDatos("ventas");

    if (!lista) return;

    lista.innerHTML = "";

    if (ventas.length === 0) {
        lista.innerHTML = `
            <tr>
                <td colspan="6">No existen ventas registradas.</td>
            </tr>
        `;

        return;
    }

    ventas.forEach(venta => {
        const fila = document.createElement("tr");

        fila.innerHTML = `
            <td>${textoSeguro(venta.cliente)}</td>
            <td>${textoSeguro(venta.producto)}</td>
            <td>${venta.cantidad}</td>
            <td>${dinero(venta.total)}</td>
            <td>${venta.tipo === "fiado" ? "Fiado" : "Contado"}</td>
            <td>${textoSeguro(venta.fecha)}</td>
        `;

        lista.appendChild(fila);
    });
}


/* =========================================
   CUENTAS POR COBRAR
========================================= */

function saldoCuenta(cuenta) {
    if (Number.isFinite(Number(cuenta.saldo))) {
        return Math.max(0, Number(cuenta.saldo));
    }

    const abonado = Number(cuenta.abonado || 0);

    return Math.max(0, Number(cuenta.total) - abonado);
}

function mostrarCuentas() {
    const lista = document.getElementById("listaCuentas");
    const cuentas = obtenerDatos("cuentas");

    if (!lista) return;

    lista.innerHTML = "";

    if (cuentas.length === 0) {
        lista.innerHTML = `
            <tr>
                <td colspan="6">No existen cuentas pendientes.</td>
            </tr>
        `;

        return;
    }

    cuentas.forEach(cuenta => {
        const saldo = saldoCuenta(cuenta);
        const pagada = saldo <= 0;

        const fila = document.createElement("tr");

        fila.innerHTML = `
            <td>${textoSeguro(cuenta.cliente)}</td>
            <td>${textoSeguro(cuenta.producto)}</td>
            <td>
                ${dinero(cuenta.total)}
                <br><small>Abonado: ${dinero(cuenta.abonado || 0)}</small>
                <br><strong>Saldo: ${dinero(saldo)}</strong>
            </td>
            <td>${textoSeguro(cuenta.fecha)}</td>
            <td>
                <span class="estado ${pagada ? "estado-pagado" : "estado-pendiente"}">
                    ${pagada ? "Pagado" : "Pendiente"}
                </span>
            </td>
            <td>
                ${!pagada ? `
                    <button class="btn-pagar"
                        onclick="abonarCuenta(${Number(cuenta.id)})">
                        Registrar abono
                    </button>
                ` : "—"}
            </td>
        `;

        lista.appendChild(fila);
    });

    const pendiente = cuentas.reduce(
        (suma, cuenta) => suma + saldoCuenta(cuenta),
        0
    );

    const resumen = document.getElementById("saldoPendiente");

    if (resumen) {
        resumen.textContent = dinero(pendiente);
    }
}


/* =========================================
   REGISTRAR ABONOS
========================================= */

function abonarCuenta(id) {
    if (!verificarPermiso("cuentas")) return;

    const cuentas = obtenerDatos("cuentas");

    const cuenta = cuentas.find(item =>
        String(item.id) === String(id)
    );

    if (!cuenta) return;

    const saldo = saldoCuenta(cuenta);

    if (saldo <= 0) {
        alert("Esta cuenta ya está pagada.");
        return;
    }

    const valor = Number(prompt(
        "Cliente: " + cuenta.cliente +
        "\nSaldo pendiente: " + dinero(saldo) +
        "\n\nIngrese el valor del abono:"
    ));

    if (!Number.isFinite(valor) || valor <= 0) {
        alert("Ingrese un valor válido.");
        return;
    }

    if (valor > saldo) {
        alert("El abono no puede superar el saldo pendiente.");
        return;
    }

    cuenta.abonado = Number(cuenta.abonado || 0) + valor;
    cuenta.saldo = saldo - valor;
    cuenta.estado = cuenta.saldo <= 0 ? "Pagado" : "Pendiente";

    if (!Array.isArray(cuenta.abonos)) {
        cuenta.abonos = [];
    }

    cuenta.abonos.push({
        valor,
        fecha: fechaActual()
    });

    guardarDatos("cuentas", cuentas);

    agregarMovimiento(
        "ingreso",
        "Abono de " + cuenta.cliente + " - " + cuenta.producto,
        valor
    );

    alert(
        "Abono registrado correctamente.\n" +
        "Nuevo saldo: " + dinero(cuenta.saldo)
    );

    actualizarTodo();
}

function marcarPagado(id) {
    abonarCuenta(id);
}


/* =========================================
   INVENTARIO: AGREGAR PRODUCTO
========================================= */

function agregarProducto() {
    if (!verificarPermiso("inventario")) return;

    const nombre = document.getElementById("productoNombre").value.trim();
    const categoria = document.getElementById("productoCategoria").value.trim();
    const precio = Number(document.getElementById("productoPrecio").value);
    const cantidad = Number(document.getElementById("productoCantidad").value);

    if (
        !nombre ||
        !categoria ||
        !Number.isFinite(precio) ||
        precio <= 0 ||
        !Number.isInteger(cantidad) ||
        cantidad < 0
    ) {
        alert("Complete todos los campos correctamente.");
        return;
    }

    const inventario = obtenerDatos("inventario");

    const existente = inventario.find(producto =>
        producto.nombre.trim().toLowerCase() === nombre.toLowerCase()
    );

    if (existente) {
        alert(
            "Este producto ya existe en el inventario.\n" +
            "No se puede registrar nuevamente."
        );

        return;
    }

    inventario.push({
        id: Date.now(),
        nombre,
        categoria,
        precio,
        cantidad
    });

    guardarDatos("inventario", inventario);

    alert("Producto agregado correctamente.");

    document.getElementById("productoNombre").value = "";
    document.getElementById("productoCategoria").value = "";
    document.getElementById("productoPrecio").value = "";
    document.getElementById("productoCantidad").value = 1;

    actualizarTodo();
}


/* =========================================
   INVENTARIO: EDITAR PRODUCTO
========================================= */

function editarProducto(id) {
    if (!verificarPermiso("inventario")) return;

    const inventario = obtenerDatos("inventario");

    const producto = inventario.find(item =>
        String(item.id) === String(id)
    );

    if (!producto) {
        alert("No se encontró el producto.");
        return;
    }

    const nuevoNombre = prompt(
        "Ingrese el nuevo nombre del producto:",
        producto.nombre
    );

    if (nuevoNombre === null) return;

    const nombreLimpio = nuevoNombre.trim();

    if (!nombreLimpio) {
        alert("El nombre del producto no puede estar vacío.");
        return;
    }

    const nombreDuplicado = inventario.some(item =>
        String(item.id) !== String(id) &&
        item.nombre.trim().toLowerCase() === nombreLimpio.toLowerCase()
    );

    if (nombreDuplicado) {
        alert("Ya existe otro producto con ese nombre.");
        return;
    }

    const nuevoPrecioTexto = prompt(
        "Ingrese el nuevo precio del producto:",
        producto.precio
    );

    if (nuevoPrecioTexto === null) return;

    const nuevoPrecio = Number(nuevoPrecioTexto);

    if (!Number.isFinite(nuevoPrecio) || nuevoPrecio <= 0) {
        alert("Ingrese un precio válido mayor que cero.");
        return;
    }

    const nuevaCantidadTexto = prompt(
        "Ingrese la nueva cantidad disponible:",
        producto.cantidad
    );

    if (nuevaCantidadTexto === null) return;

    const nuevaCantidad = Number(nuevaCantidadTexto);

    if (
        nuevaCantidadTexto.trim() === "" ||
        !Number.isInteger(nuevaCantidad) ||
        nuevaCantidad < 0
    ) {
        alert(
            "Ingrese una cantidad válida. Debe ser un número entero igual o mayor que cero."
        );

        return;
    }

    const productoEnCarrito = carrito.find(item =>
        String(item.id) === String(id)
    );

    if (
        productoEnCarrito &&
        productoEnCarrito.cantidad > nuevaCantidad
    ) {
        alert(
            "No puede establecer una cantidad menor a la que ya está en el carrito.\n" +
            "Cantidad en el carrito: " + productoEnCarrito.cantidad
        );

        return;
    }

    producto.nombre = nombreLimpio;
    producto.precio = nuevoPrecio;
    producto.cantidad = nuevaCantidad;

    guardarDatos("inventario", inventario);

    carrito.forEach(item => {
        if (String(item.id) === String(id)) {
            item.nombre = nombreLimpio;
            item.precio = nuevoPrecio;
        }
    });

    alert("Producto actualizado correctamente.");

    actualizarTodo();
}


/* =========================================
   INVENTARIO: ELIMINAR PRODUCTO
========================================= */

function eliminarProducto(id) {
    if (!verificarPermiso("inventario")) return;

    const inventario = obtenerDatos("inventario");

    const producto = inventario.find(item =>
        String(item.id) === String(id)
    );

    if (!producto) {
        alert("No se encontró el producto.");
        return;
    }

    const confirmar = confirm(
        "¿Está seguro de eliminar el producto " +
        producto.nombre + "?"
    );

    if (!confirmar) return;

    const nuevoInventario = inventario.filter(item =>
        String(item.id) !== String(id)
    );

    guardarDatos("inventario", nuevoInventario);

    carrito = carrito.filter(item =>
        String(item.id) !== String(id)
    );

    alert("Producto eliminado correctamente.");

    actualizarTodo();
}


/* =========================================
   MOSTRAR INVENTARIO
========================================= */

function mostrarInventario() {
    const lista = document.getElementById("listaInventario");
    const inventario = obtenerDatos("inventario");

    if (!lista) return;

    lista.innerHTML = "";

    if (inventario.length === 0) {
        lista.innerHTML = `
            <tr>
                <td colspan="6">No existen productos registrados.</td>
            </tr>
        `;

        return;
    }

    inventario.forEach(producto => {
        const disponible = Number(producto.cantidad) > 0;

        const fila = document.createElement("tr");

        fila.innerHTML = `
            <td>${textoSeguro(producto.nombre)}</td>
            <td>${textoSeguro(producto.categoria)}</td>
            <td>${dinero(producto.precio)}</td>
            <td>${Number(producto.cantidad)}</td>
            <td>
                <span class="estado ${
                    disponible ? "estado-disponible" : "estado-agotado"
                }">
                    ${disponible ? "Disponible" : "Agotado"}
                </span>
            </td>
            <td>
                <button class="btn-editar"
                    onclick="editarProducto(${Number(producto.id)})">
                    <i class="fa-solid fa-pen"></i>
                    Editar
                </button>

                <button class="btn-eliminar"
                    onclick="eliminarProducto(${Number(producto.id)})">
                    <i class="fa-solid fa-trash"></i>
                    Eliminar
                </button>
            </td>
        `;

        lista.appendChild(fila);
    });
}


/* =========================================
   INGRESOS Y EGRESOS
========================================= */

function registrarMovimiento() {
    if (!verificarPermiso("movimientos")) return;

    const tipo = document.getElementById("movimientoTipo").value;
    const descripcion = document.getElementById("movimientoDescripcion").value.trim();
    const valor = Number(document.getElementById("movimientoValor").value);

    if (!descripcion || !Number.isFinite(valor) || valor <= 0) {
        alert("Complete todos los campos correctamente.");
        return;
    }

    agregarMovimiento(tipo, descripcion, valor);

    alert("Movimiento registrado correctamente.");

    document.getElementById("movimientoDescripcion").value = "";
    document.getElementById("movimientoValor").value = "";

    actualizarTodo();
}

function mostrarMovimientos() {
    const lista = document.getElementById("listaMovimientos");
    const movimientos = obtenerDatos("movimientos");

    if (!lista) return;

    lista.innerHTML = "";

    if (movimientos.length === 0) {
        lista.innerHTML = `
            <tr>
                <td colspan="4">No existen movimientos registrados.</td>
            </tr>
        `;

        return;
    }

    movimientos.forEach(movimiento => {
        const fila = document.createElement("tr");

        fila.innerHTML = `
            <td>${textoSeguro(movimiento.tipo)}</td>
            <td>${textoSeguro(movimiento.descripcion)}</td>
            <td>${dinero(movimiento.valor)}</td>
            <td>${textoSeguro(movimiento.fecha)}</td>
        `;

        lista.appendChild(fila);
    });
}


/* =========================================
   PANEL PRINCIPAL
========================================= */

function actualizarInicio() {
    const ventas = obtenerDatos("ventas");
    const cuentas = obtenerDatos("cuentas");
    const inventario = obtenerDatos("inventario");
    const movimientos = obtenerDatos("movimientos");

    const totalVentas = ventas.reduce(
        (s, v) => s + Number(v.total || 0),
        0
    );

    const totalCobrar = cuentas.reduce(
        (s, c) => s + saldoCuenta(c),
        0
    );

    const totalProductos = inventario.reduce(
        (s, p) => s + Number(p.cantidad || 0),
        0
    );

    const totalIngresos = movimientos
        .filter(m => m.tipo === "ingreso")
        .reduce((s, m) => s + Number(m.valor || 0), 0);

    const elementos = {
        totalVentas: dinero(totalVentas),
        totalCobrar: dinero(totalCobrar),
        totalProductos,
        totalIngresos: dinero(totalIngresos)
    };

    Object.entries(elementos).forEach(([id, valor]) => {
        const elemento = document.getElementById(id);

        if (elemento) {
            elemento.textContent = valor;
        }
    });
}


/* =========================================
   REPORTES
========================================= */

function actualizarReportes() {
    const ventas = obtenerDatos("ventas");
    const movimientos = obtenerDatos("movimientos");

    const totalVentas = ventas.reduce(
        (s, v) => s + Number(v.total || 0),
        0
    );

    const ingresos = movimientos
        .filter(m => m.tipo === "ingreso")
        .reduce((s, m) => s + Number(m.valor || 0), 0);

    const egresos = movimientos
        .filter(m => m.tipo === "egreso")
        .reduce((s, m) => s + Number(m.valor || 0), 0);

    const balance = ingresos - egresos;

    const datos = {
        reporteVentas: dinero(totalVentas),
        reporteIngresos: dinero(ingresos),
        reporteEgresos: dinero(egresos),
        reporteBalance: dinero(balance)
    };

    Object.entries(datos).forEach(([id, valor]) => {
        const elemento = document.getElementById(id);

        if (elemento) {
            elemento.textContent = valor;
        }
    });
}


/* =========================================
   ADMINISTRACIÓN DE USUARIOS
========================================= */

function crearUsuario(event) {
    event.preventDefault();

    if (!esAdministrador()) {
        alert("Solo el administrador puede crear usuarios.");
        return;
    }

    const nombre = document.getElementById("nuevoNombre").value.trim();
    const usuario = document.getElementById("nuevoUsuario").value.trim();
    const contrasena = document.getElementById("nuevaContrasena").value;
    const rol = document.getElementById("nuevoRol").value;

    if (!nombre || !usuario || !contrasena) {
        alert("Complete todos los campos.");
        return;
    }

    const usuarios = obtenerUsuarios();

    const duplicado = usuarios.some(u =>
        u.usuario.toLowerCase() === usuario.toLowerCase()
    );

    if (duplicado) {
        alert("Ese nombre de usuario ya existe.");
        return;
    }

    let permisos = [];

    if (rol === "administrador") {
        permisos = PERMISOS_SECCIONES.slice();
    } else {
        PERMISOS_SECCIONES.forEach(seccion => {
            const checkbox = document.getElementById(
                "permiso" +
                seccion.charAt(0).toUpperCase() +
                seccion.slice(1)
            );

            if (checkbox && checkbox.checked) {
                permisos.push(seccion);
            }
        });
    }

    const nuevo = {
        id: Date.now(),
        nombre,
        usuario,
        contrasena,
        rol,
        permisos
    };

    usuarios.push(nuevo);

    guardarUsuarios(usuarios);

    alert("Usuario creado correctamente.");

    document.getElementById("formularioUsuario").reset();

    mostrarUsuarios();
}

function mostrarUsuarios() {
    const lista = document.getElementById("listaUsuarios");

    if (!lista) return;

    if (!esAdministrador()) {
        lista.innerHTML = "";
        return;
    }

    const usuarios = obtenerUsuarios();

    lista.innerHTML = "";

    usuarios.forEach(usuario => {
        const fila = document.createElement("tr");

        const permisosTexto = usuario.rol === "administrador"
            ? "Todos los permisos"
            : (usuario.permisos || []).join(", ") || "Sin permisos";

        fila.innerHTML = `
            <td>${textoSeguro(usuario.nombre)}</td>
            <td>${textoSeguro(usuario.usuario)}</td>
            <td>${textoSeguro(usuario.rol)}</td>
            <td>${textoSeguro(permisosTexto)}</td>
            <td>
                ${
                    String(usuario.id) !== String(usuarioActual.id)
                    ? `
                        <button class="btn-eliminar"
                            onclick="eliminarUsuario(${Number(usuario.id)})">
                            <i class="fa-solid fa-trash"></i>
                            Eliminar
                        </button>
                    `
                    : "Cuenta actual"
                }
            </td>
        `;

        lista.appendChild(fila);
    });
}

function eliminarUsuario(id) {
    if (!esAdministrador()) {
        alert("Solo el administrador puede eliminar usuarios.");
        return;
    }

    if (String(id) === String(usuarioActual.id)) {
        alert("No puede eliminar su propia cuenta.");
        return;
    }

    const usuarios = obtenerUsuarios();

    const usuario = usuarios.find(u =>
        String(u.id) === String(id)
    );

    if (!usuario) return;

    if (!confirm("¿Desea eliminar al usuario " + usuario.nombre + "?")) {
        return;
    }

    const nuevosUsuarios = usuarios.filter(u =>
        String(u.id) !== String(id)
    );

    guardarUsuarios(nuevosUsuarios);

    alert("Usuario eliminado correctamente.");

    mostrarUsuarios();
}


/* =========================================
   ACTUALIZAR TODO EL SISTEMA
========================================= */

function actualizarTodo() {
    if (!usuarioActual) return;

    mostrarVentas();
    mostrarCuentas();
    mostrarInventario();
    mostrarMovimientos();

    cargarProductosVenta();
    mostrarCarrito();

    actualizarInicio();
    actualizarReportes();

    if (esAdministrador()) {
        mostrarUsuarios();
    }
}


/* =========================================
   INICIAR SISTEMA
========================================= */

document.addEventListener("DOMContentLoaded", () => {

    inicializarUsuarios();

    const formularioLogin = document.getElementById("formularioLogin");
    const botonCerrarSesion = document.getElementById("btnCerrarSesion");
    const formularioUsuario = document.getElementById("formularioUsuario");

    if (formularioLogin) {
        formularioLogin.addEventListener("submit", iniciarSesion);
    }

    if (botonCerrarSesion) {
        botonCerrarSesion.addEventListener("click", cerrarSesion);
    }

    if (formularioUsuario) {
        formularioUsuario.addEventListener("submit", crearUsuario);
    }

    recuperarSesion();

});