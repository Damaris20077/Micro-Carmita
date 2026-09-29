/* =========================================
   NAVEGACIÓN
========================================= */

function mostrarSeccion(nombreSeccion, boton) {

    // Ocultar todas las secciones
    const secciones = document.querySelectorAll(".seccion");

    secciones.forEach(seccion => {
        seccion.classList.remove("activa-seccion");
    });


    // Mostrar la sección seleccionada
    const seccionSeleccionada =
        document.getElementById(nombreSeccion);

    if (seccionSeleccionada) {
        seccionSeleccionada.classList.add("activa-seccion");
    }


    // Quitar activo de todos los botones
    const botones = document.querySelectorAll(".menu");

    botones.forEach(btn => {
        btn.classList.remove("activo");
    });


    // Activar botón seleccionado
    boton.classList.add("activo");


    // Actualizar información
    actualizarTodo();
}



/* =========================================
   OBTENER DATOS DE LOCALSTORAGE
========================================= */

function obtenerDatos(clave) {

    return JSON.parse(
        localStorage.getItem(clave)
    ) || [];

}


/* =========================================
   GUARDAR DATOS
========================================= */

function guardarDatos(clave, datos) {

    localStorage.setItem(
        clave,
        JSON.stringify(datos)
    );

}



/* =========================================
   VENTAS
========================================= */

function registrarVenta() {

    const cliente =
        document.getElementById("ventaCliente").value.trim();

    const producto =
        document.getElementById("ventaProducto").value.trim();

    const cantidad =
        Number(document.getElementById("ventaCantidad").value);

    const precio =
        Number(document.getElementById("ventaPrecio").value);

    const tipo =
        document.getElementById("ventaTipo").value;


    if (!cliente || !producto || cantidad <= 0 || precio <= 0) {

        alert("Complete todos los campos correctamente.");

        return;
    }


    const total = cantidad * precio;


    const venta = {

        id: Date.now(),

        cliente: cliente,

        producto: producto,

        cantidad: cantidad,

        precio: precio,

        total: total,

        tipo: tipo,

        fecha: new Date().toLocaleDateString("es-EC")

    };


    const ventas = obtenerDatos("ventas");

    ventas.push(venta);

    guardarDatos("ventas", ventas);


    // Si la venta es fiada,
    // también se registra como cuenta por cobrar
    if (tipo === "fiado") {

        const cuentas = obtenerDatos("cuentas");

        cuentas.push({

            id: venta.id,

            cliente: cliente,

            producto: producto,

            total: total,

            fecha: venta.fecha,

            estado: "Pendiente"

        });

        guardarDatos("cuentas", cuentas);

    }


    alert(
        "Venta registrada correctamente.\n\n" +
        "Total: $" + total.toFixed(2)
    );


    // Limpiar formulario

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

    const lista =
        document.getElementById("listaVentas");

    const ventas =
        obtenerDatos("ventas");


    lista.innerHTML = "";


    if (ventas.length === 0) {

        lista.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;">
                    No existen ventas registradas.
                </td>
            </tr>
        `;

        return;
    }


    ventas.forEach(venta => {

        const fila = document.createElement("tr");


        fila.innerHTML = `

            <td>${venta.cliente}</td>

            <td>${venta.producto}</td>

            <td>${venta.cantidad}</td>

            <td>$${venta.total.toFixed(2)}</td>

            <td>
                <span class="estado ${
                    venta.tipo === "fiado"
                    ? "estado-pendiente"
                    : "estado-pagado"
                }">
                    ${
                        venta.tipo === "fiado"
                        ? "Fiado"
                        : "Contado"
                    }
                </span>
            </td>

            <td>${venta.fecha}</td>

        `;


        lista.appendChild(fila);

    });

}



/* =========================================
   CUENTAS POR COBRAR
========================================= */

function mostrarCuentas() {

    const lista =
        document.getElementById("listaCuentas");

    const cuentas =
        obtenerDatos("cuentas");


    lista.innerHTML = "";


    if (cuentas.length === 0) {

        lista.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;">
                    No existen cuentas pendientes.
                </td>
            </tr>
        `;

        return;
    }


    cuentas.forEach(cuenta => {

        const fila =
            document.createElement("tr");


        fila.innerHTML = `

            <td>${cuenta.cliente}</td>

            <td>${cuenta.producto}</td>

            <td>$${cuenta.total.toFixed(2)}</td>

            <td>${cuenta.fecha}</td>

            <td>

                <span class="estado ${
                    cuenta.estado === "Pendiente"
                    ? "estado-pendiente"
                    : "estado-pagado"
                }">

                    ${cuenta.estado}

                </span>

            </td>

            <td>

                ${
                    cuenta.estado === "Pendiente"

                    ?

                    `<button
                        class="btn-pagar"
                        onclick="marcarPagado(${cuenta.id})">
                        Pagar
                    </button>`

                    :

                    "—"
                }

            </td>

        `;


        lista.appendChild(fila);

    });

}



/* =========================================
   MARCAR CUENTA COMO PAGADA
========================================= */

function marcarPagado(id) {

    const cuentas =
        obtenerDatos("cuentas");


    const cuenta =
        cuentas.find(item => item.id === id);


    if (!cuenta) {
        return;
    }


    cuenta.estado = "Pagado";


    guardarDatos("cuentas", cuentas);


    alert(
        "Cuenta registrada como pagada correctamente."
    );


    actualizarTodo();

}



/* =========================================
   INVENTARIO
========================================= */

function agregarProducto() {

    const nombre =
        document.getElementById("productoNombre").value.trim();

    const categoria =
        document.getElementById("productoCategoria").value.trim();

    const precio =
        Number(document.getElementById("productoPrecio").value);

    const cantidad =
        Number(document.getElementById("productoCantidad").value);


    if (!nombre || !categoria || precio <= 0 || cantidad < 0) {

        alert(
            "Complete todos los campos correctamente."
        );

        return;
    }


    const producto = {

        id: Date.now(),

        nombre: nombre,

        categoria: categoria,

        precio: precio,

        cantidad: cantidad

    };


    const inventario =
        obtenerDatos("inventario");


    inventario.push(producto);


    guardarDatos(
        "inventario",
        inventario
    );


    alert(
        "Producto agregado correctamente."
    );


    document.getElementById("productoNombre").value = "";

    document.getElementById("productoCategoria").value = "";

    document.getElementById("productoPrecio").value = "";

    document.getElementById("productoCantidad").value = 1;


    actualizarTodo();

}



/* =========================================
   MOSTRAR INVENTARIO
========================================= */

function mostrarInventario() {

    const lista =
        document.getElementById("listaInventario");


    const inventario =
        obtenerDatos("inventario");


    lista.innerHTML = "";


    if (inventario.length === 0) {

        lista.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center;">
                    No existen productos registrados.
                </td>
            </tr>
        `;

        return;
    }


    inventario.forEach(producto => {

        const fila =
            document.createElement("tr");


        const disponible =
            producto.cantidad > 0;


        fila.innerHTML = `

            <td>${producto.nombre}</td>

            <td>${producto.categoria}</td>

            <td>$${producto.precio.toFixed(2)}</td>

            <td>${producto.cantidad}</td>

            <td>

                <span class="estado ${
                    disponible
                    ? "estado-disponible"
                    : "estado-agotado"
                }">

                    ${
                        disponible
                        ? "Disponible"
                        : "Agotado"
                    }

                </span>

            </td>

        `;


        lista.appendChild(fila);

    });

}



/* =========================================
   INGRESOS Y EGRESOS
========================================= */

function registrarMovimiento() {

    const tipo =
        document.getElementById("movimientoTipo").value;

    const descripcion =
        document.getElementById("movimientoDescripcion").value.trim();

    const valor =
        Number(document.getElementById("movimientoValor").value);


    if (!descripcion || valor <= 0) {

        alert(
            "Complete todos los campos correctamente."
        );

        return;
    }


    const movimiento = {

        id: Date.now(),

        tipo: tipo,

        descripcion: descripcion,

        valor: valor,

        fecha: new Date().toLocaleDateString("es-EC")

    };


    const movimientos =
        obtenerDatos("movimientos");


    movimientos.push(movimiento);


    guardarDatos(
        "movimientos",
        movimientos
    );


    alert(
        "Movimiento registrado correctamente."
    );


    document.getElementById(
        "movimientoDescripcion"
    ).value = "";


    document.getElementById(
        "movimientoValor"
    ).value = "";


    actualizarTodo();

}



/* =========================================
   MOSTRAR MOVIMIENTOS
========================================= */

function mostrarMovimientos() {

    const lista =
        document.getElementById("listaMovimientos");


    const movimientos =
        obtenerDatos("movimientos");


    lista.innerHTML = "";


    if (movimientos.length === 0) {

        lista.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center;">
                    No existen movimientos registrados.
                </td>
            </tr>
        `;

        return;
    }


    movimientos.forEach(movimiento => {

        const fila =
            document.createElement("tr");


        fila.innerHTML = `

            <td>

                <span class="estado ${
                    movimiento.tipo === "ingreso"
                    ? "estado-disponible"
                    : "estado-agotado"
                }">

                    ${
                        movimiento.tipo === "ingreso"
                        ? "Ingreso"
                        : "Egreso"
                    }

                </span>

            </td>

            <td>${movimiento.descripcion}</td>

            <td>$${movimiento.valor.toFixed(2)}</td>

            <td>${movimiento.fecha}</td>

        `;


        lista.appendChild(fila);

    });

}



/* =========================================
   ACTUALIZAR INICIO
========================================= */

function actualizarInicio() {

    const ventas =
        obtenerDatos("ventas");

    const cuentas =
        obtenerDatos("cuentas");

    const inventario =
        obtenerDatos("inventario");

    const movimientos =
        obtenerDatos("movimientos");


    // Total ventas

    const totalVentas =
        ventas.reduce(
            (suma, venta) =>
                suma + venta.total,
            0
        );


    // Total pendiente

    const totalCobrar =
        cuentas
            .filter(cuenta => cuenta.estado === "Pendiente")
            .reduce(
                (suma, cuenta) =>
                    suma + cuenta.total,
                0
            );


    // Total productos

    const totalProductos =
        inventario.reduce(
            (suma, producto) =>
                suma + producto.cantidad,
            0
        );


    // Total ingresos

    const totalIngresos =
        movimientos
            .filter(movimiento => movimiento.tipo === "ingreso")
            .reduce(
                (suma, movimiento) =>
                    suma + movimiento.valor,
                0
            );


    document.getElementById(
        "totalVentas"
    ).textContent =
        "$" + totalVentas.toFixed(2);


    document.getElementById(
        "totalCobrar"
    ).textContent =
        "$" + totalCobrar.toFixed(2);


    document.getElementById(
        "totalProductos"
    ).textContent =
        totalProductos;


    document.getElementById(
        "totalIngresos"
    ).textContent =
        "$" + totalIngresos.toFixed(2);

}



/* =========================================
   ACTUALIZAR REPORTES
========================================= */

function actualizarReportes() {

    const ventas =
        obtenerDatos("ventas");


    const movimientos =
        obtenerDatos("movimientos");


    const totalVentas =
        ventas.reduce(
            (suma, venta) =>
                suma + venta.total,
            0
        );


    const ingresos =
        movimientos
            .filter(item => item.tipo === "ingreso")
            .reduce(
                (suma, item) =>
                    suma + item.valor,
                0
            );


    const egresos =
        movimientos
            .filter(item => item.tipo === "egreso")
            .reduce(
                (suma, item) =>
                    suma + item.valor,
                0
            );


    const balance =
        ingresos - egresos;


    document.getElementById(
        "reporteVentas"
    ).textContent =
        "$" + totalVentas.toFixed(2);


    document.getElementById(
        "reporteIngresos"
    ).textContent =
        "$" + ingresos.toFixed(2);


    document.getElementById(
        "reporteEgresos"
    ).textContent =
        "$" + egresos.toFixed(2);


    document.getElementById(
        "reporteBalance"
    ).textContent =
        "$" + balance.toFixed(2);

}



/* =========================================
   ACTUALIZAR TODO
========================================= */

function actualizarTodo() {

    mostrarVentas();

    mostrarCuentas();

    mostrarInventario();

    mostrarMovimientos();

    actualizarInicio();

    actualizarReportes();

}



/* =========================================
   INICIAR SISTEMA
========================================= */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        actualizarTodo();

    }
);